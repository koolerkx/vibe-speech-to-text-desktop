# P1 技術棧規劃：Google Cloud Speech-to-Text 版

## 1. 背景與前提修正

P0 假設「Electron 的 Chromium 可沿用 speechnotes 的 `webkitSpeechRecognition`」。此假設經查證**不成立**：

- `webkitSpeechRecognition` 實際上把錄音上傳至 Google **私有 Speech backend**，需內嵌的 Google API key 才能呼叫。
- 官方 Chrome build 內嵌該 key；**Electron 的 Chromium build 沒有**，呼叫直接拋 `network` error。
- 該 key 僅供 Chromium 內部使用，不對外開放、無法購買 quota。
- WebView2（Tauri 路線）**完全不支援** SpeechRecognition，呼叫靜默失敗，比 Electron 更差。

結論：STT 引擎必須改用付費 / 自架方案。本規劃採用 **Google Cloud Speech-to-Text（streaming）**，並因此重新選定技術棧。

---

## 2. 技術棧總覽

| Layer | 選型 | 理由 |
| ----- | ---- | ---- |
| Framework | **Electron + React + TypeScript** | Main 程序為 Node.js，是 Google 官方 streaming SDK 的原生環境 |
| STT client | **`@google-cloud/speech`**（Node，Main 程序） | 唯一成熟支援 gRPC bidirectional streaming 的官方 SDK |
| 認證 | **Service Account JSON**，僅存於 Main 程序 | key 不進 Renderer，避免外洩 |
| 麥克風擷取 | **Renderer**：`getUserMedia` + `AudioWorklet`，輸出 16kHz mono PCM | 用 Web Audio 取原始 PCM，免依賴原生音訊庫 |
| 音訊傳輸 | Renderer → Main 透過 **IPC**（`postMessage` 傳 `ArrayBuffer`） | 將 PCM chunk 餵入 gRPC stream |
| 文字注入 | **`@nut-tree/nut-js`** + Clipboard 貼上雙策略 | 涵蓋 Terminal / Browser / Editor |
| 全域快捷鍵 | Electron `globalShortcut` | 啟停聽寫 |
| Always on Top | `BrowserWindow.setAlwaysOnTop(true, 'screen-saver')` | 浮動視窗 |
| 常駐 | Tray icon | 背景常駐 |
| 未來桌寵動畫 | Live2D Cubism SDK for Web（Renderer） | 與 React 同層，無縫整合 |
| 打包 | `electron-builder` | 產生 Windows `.exe` installer |

---

## 3. 為什麼選 Electron 而非 Tauri

| 項目 | Electron（採用） | Tauri |
| ---- | --------------- | ----- |
| Google Cloud STT streaming | ✅ 官方 Node SDK，high-level API | ⚠️ Rust 端無成熟 client，需手刻 `tonic` + proto + token 刷新 |
| 麥克風擷取 | ✅ Web Audio（`getUserMedia`） | ⚠️ 需用 `cpal` 原生庫 |
| 文字注入 | ✅ `@nut-tree/nut-js` 現成 | 需用 `enigo`（可行但較少文件） |
| Live2D | ✅ JS SDK 直接跑 | ✅ JS SDK 直接跑 |
| 打包體積 | ~150MB | ~5MB |
| 記憶體 | 較高 | 較低 |

決策：除非體積 / 記憶體為硬需求，Electron 在「官方 SDK 原生環境 + 麥克風 + 文字注入」三項皆勝出，為本專案最佳解。

---

## 4. 架構圖

```
┌──────────────────────────── Electron ────────────────────────────┐
│                                                                   │
│  Renderer (React + TS)                Main (Node.js)              │
│  ┌─────────────────────────┐          ┌───────────────────────┐  │
│  │ getUserMedia             │          │ @google-cloud/speech  │  │
│  │   + AudioWorklet         │  PCM     │  StreamingRecognize   │  │
│  │   16kHz mono PCM         │─chunks──▶│  (service account)    │──gRPC──▶ Google Cloud STT
│  │                          │  (IPC)   │                       │◀─────── interim / final
│  │ UI / Avatar / Live2D     │◀─文字────│ 文字注入 (nut-js)       │  │
│  │ 即時草稿顯示              │  (IPC)   │ globalShortcut / Tray  │  │
│  └─────────────────────────┘          └───────────────────────┘  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 5. 資料流（即時聽寫一次循環）

1. 使用者按全域快捷鍵 → Main 通知 Renderer 開始擷取。
2. Renderer `getUserMedia` 取得麥克風 → `AudioWorklet` 將音訊降採樣為 **16kHz mono 16-bit PCM**。
3. Renderer 每 ~100ms 將 PCM chunk 經 IPC 傳到 Main。
4. Main 將 chunk 寫入 `@google-cloud/speech` 的 `streamingRecognize` writable stream。
5. Google 回傳 `interim` 結果 → Main 經 IPC 傳回 Renderer 顯示即時草稿。
6. 收到 `is_final` 結果 → Main 觸發文字注入，將最終文字送入前景視窗。
7. 使用者再按快捷鍵 → 結束 stream，釋放資源。

---

## 6. STT 設定（Google Cloud STREAMING）

| 設定 | 值 | 說明 |
| ---- | --- | ---- |
| `encoding` | `LINEAR16` | 對應 AudioWorklet 輸出的 16-bit PCM |
| `sampleRateHertz` | `16000` | 與擷取端一致 |
| `languageCode` | `yue-Hant-HK` | 粵語（繁體，香港）|
| `alternativeLanguageCodes` | `['zh-TW', 'en-US']`（可選） | 中英混說容錯 |
| `interimResults` | `true` | 即時草稿 |
| `enableAutomaticPunctuation` | `true` | 自動標點 |
| `model` | `latest_long` | 長時聽寫優化（依語系可用性確認）|

---

## 7. 關鍵實作風險與對策

| 風險 | 對策 |
| ---- | ---- |
| 單一 streaming session 有 **~5 分鐘上限** | 計時 / 沉默偵測自動切段，無縫開新 stream 重連，緩衝跨段音訊 |
| `interim` 與 `final` 重複輸入 | 僅在 `is_final` 才執行文字注入；草稿僅顯示於 UI |
| Service Account key 外洩 | key 僅置於 Main 程序；Renderer 透過 IPC 取結果，永不接觸憑證 |
| Clipboard 注入覆蓋使用者剪貼簿 | 注入前備份剪貼簿內容，注入後還原 |
| 中文 / 標點注入相容性 | 主策略用 Clipboard + `Ctrl+V`；`nut-js` 逐字元為備援 |
| 網路延遲 / 斷線 | stream error 事件偵測 → 自動重連 + UI 狀態提示 |
| Google Cloud 費用 | streaming 按音訊時長計費；UI 顯示使用時長，未來可加月用量上限 |

---

## 8. 專案初始結構（建議）

```
speech-to-text-desktop/
├── src/
│   ├── main/                  # Electron Main (Node.js)
│   │   ├── index.ts           # app 生命週期、視窗、Tray
│   │   ├── stt/
│   │   │   ├── googleStream.ts # @google-cloud/speech streaming 封裝
│   │   │   └── reconnect.ts    # 5 分鐘上限自動切段重連
│   │   ├── inject/
│   │   │   └── textInject.ts   # nut-js + clipboard 雙策略
│   │   ├── shortcut.ts         # globalShortcut
│   │   └── ipc.ts              # IPC channel 定義
│   ├── renderer/              # React + TS
│   │   ├── App.tsx
│   │   ├── audio/
│   │   │   ├── capture.ts      # getUserMedia
│   │   │   └── pcm-worklet.ts  # AudioWorklet 降採樣為 16kHz PCM
│   │   └── components/         # UI / Avatar（未來 Live2D）
│   └── shared/
│       └── ipc-types.ts        # Main/Renderer 共用 IPC 型別
├── electron-builder.yml
├── package.json
└── tsconfig.json
```

---

## 9. 核心相依套件

| 套件 | 用途 |
| ---- | ---- |
| `electron` | 桌面框架 |
| `react` / `react-dom` | UI |
| `typescript` | 型別 |
| `@google-cloud/speech` | STT streaming client |
| `@nut-tree/nut-js` | 文字注入（SendInput）|
| `electron-builder` | Windows 打包 |
| `vite` / `electron-vite` | 開發與打包工具鏈 |

---

## 10. 里程碑

1. **M1 基礎骨架**：Electron + React + TS + Vite 跑起來，Always on Top 浮動視窗 + Tray。
2. **M2 音訊擷取**：Renderer `getUserMedia` + AudioWorklet 產出 16kHz PCM，IPC 傳至 Main 驗證。
3. **M3 STT 串接**：Main 接 `@google-cloud/speech` streaming，console 印出 interim / final。
4. **M4 文字注入**：`is_final` 結果經 nut-js / clipboard 注入前景視窗，驗證 Terminal / Browser / Editor。
5. **M5 長時穩定**：5 分鐘上限自動重連、斷線重試、剪貼簿還原。
6. **M6 體驗完善**：全域快捷鍵啟停、即時草稿 UI、使用時長顯示。
7. **M7（未來）**：Live2D 桌寵動畫整合。

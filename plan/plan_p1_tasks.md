# P1 Phase 與 Todo Task 追蹤

本文件為 P1 實作進度的 **single source of truth**。規劃依據 [plan_p1.md](./plan_p1.md)。

## 狀態標記

- `[ ]` TODO：未開始
- `[~]` IN PROGRESS：進行中
- `[x]` DONE：完成並驗證
- `[!]` BLOCKED：受阻（於該行後標註原因）

## 進度總覽

| Phase | 名稱 | 狀態 | 對應里程碑 |
| ----- | ---- | ---- | --------- |
| P0 | 前置準備 | `[x]` | — |
| P1 | 基礎骨架 | `[ ]` | M1 |
| P2 | 音訊擷取 | `[ ]` | M2 |
| P3 | STT 串接 | `[ ]` | M3 |
| P4 | 文字注入 | `[ ]` | M4 |
| P5 | 長時穩定 | `[ ]` | M5 |
| P6 | 體驗完善 | `[ ]` | M6 |
| P7 | 桌寵動畫（未來） | `[ ]` | M7 |

---

## Phase P0：前置準備

目標：確立 Google Cloud 認證與開發環境，確保後續 phase 不被外部依賴阻塞。

- [x] 建立 Google Cloud project，啟用 Speech-to-Text API（project `master-api-498611`，streaming 呼叫成功，無 API not enabled / PERMISSION_DENIED）
- [x] 建立 Service Account，下載 JSON key（`key.json`，client `stt-dev@master-api-498611.iam.gserviceaccount.com`，已驗證可認證）
- [x] 確認 `yue-Hant-HK` 於 streaming 與 `latest_long` model 的可用性（`scripts/stt-smoke.mjs` 回報 config accepted）
- [x] 規劃 key 存放路徑（僅 Main 程序可讀，排除於 version control）（`key.json` 已列入 `.gitignore`）
- [x] 確認 Node.js / yarn 版本與 Windows build 工具鏈（Node v24.13.1、yarn 4.15.0 berry，`nodeLinker: node-modules`）

完成條件：可用 `@google-cloud/speech` 的最小 script 在 Node 環境呼叫 STT 成功。✅ `yarn run stt:smoke` 通過、`yarn run typecheck` 無錯誤。

驗證產物：
- `package.json`：`@google-cloud/speech` 相依、`tsx` / `typescript` / `@types/node` devDeps、`stt:smoke` + `typecheck` script、`packageManager: yarn@4.15.0`
- `.yarnrc.yml`：`nodeLinker: node-modules`
- `tsconfig.json`：strict TypeScript 設定（ESNext / Bundler resolution）
- `scripts/stt-smoke.ts`：TypeScript streaming config 驗證腳本（送 1s silence PCM，確認 endpoint 接受 `yue-Hant-HK` + `latest_long`）

---

## Phase P1：基礎骨架（M1）

目標：Electron + React + TypeScript + Vite 跑起來，Always on Top 浮動視窗 + Tray。

- [ ] 初始化專案（`electron-vite` + React + TypeScript）
- [ ] 建立 `src/main/` `src/renderer/` `src/shared/` 目錄結構（依 plan_p1.md §8）
- [ ] Main 建立 `BrowserWindow`，設定 `setAlwaysOnTop(true, 'screen-saver')`
- [ ] 浮動視窗去框（frameless）與基本尺寸 / 位置
- [ ] Tray icon 建立與右鍵選單（顯示 / 結束）
- [ ] 建立 `src/shared/ipc-types.ts` IPC 型別骨架
- [ ] `electron-builder.yml` 基本設定，可產出 Windows `.exe`

完成條件：`dev` 模式啟動浮動視窗常駐最上層，Tray 可操作，`build` 產出可執行安裝檔。

---

## Phase P2：音訊擷取（M2）

目標：Renderer `getUserMedia` + AudioWorklet 產出 16kHz mono 16-bit PCM，經 IPC 傳至 Main 驗證。

- [ ] `src/renderer/audio/capture.ts`：`getUserMedia` 取得麥克風 stream
- [ ] `src/renderer/audio/pcm-worklet.ts`：AudioWorklet 降採樣為 16kHz mono 16-bit PCM
- [ ] 每 ~100ms 切 PCM chunk
- [ ] 經 IPC（`postMessage` 傳 `ArrayBuffer`）將 chunk 送到 Main
- [ ] Main 端接收並驗證 chunk 格式 / 取樣率（可暫存 wav 比對）
- [ ] 麥克風權限失敗 / 無裝置的錯誤處理

完成條件：Main 能穩定收到符合 `LINEAR16` / `16000` 規格的 PCM stream。

---

## Phase P3：STT 串接（M3）

目標：Main 接 `@google-cloud/speech` streaming，console 印出 interim / final。

- [ ] `src/main/stt/googleStream.ts`：封裝 `streamingRecognize`
- [ ] 套用 STT 設定（依 plan_p1.md §6：`LINEAR16` / `16000` / `yue-Hant-HK` / `interimResults` / `enableAutomaticPunctuation` / `latest_long`）
- [ ] Service Account JSON 僅於 Main 載入，不進 Renderer
- [ ] 將 P2 的 PCM chunk 寫入 writable stream
- [ ] 接收 `interim` 結果 → IPC 回傳 Renderer 顯示草稿
- [ ] 接收 `is_final` 結果 → console 印出（注入留待 P4）
- [ ] stream error 事件基本捕捉與 log

完成條件：說話時 console 即時印出 interim，並在語句結束印出 final。

---

## Phase P4：文字注入（M4）

目標：`is_final` 結果經 nut-js / clipboard 注入前景視窗，驗證 Terminal / Browser / Editor。

- [ ] `src/main/inject/textInject.ts`：clipboard + `Ctrl+V` 主策略
- [ ] `@nut-tree/nut-js` 逐字元注入備援策略
- [ ] 注入前備份剪貼簿、注入後還原
- [ ] 僅在 `is_final` 觸發注入，避免 interim / final 重複輸入
- [ ] 驗證中文 / 標點注入相容性
- [ ] 跨應用驗證：Terminal / Browser / Editor

完成條件：最終文字正確注入三類前景應用，剪貼簿內容還原無誤。

---

## Phase P5：長時穩定（M5）

目標：5 分鐘上限自動重連、斷線重試、剪貼簿還原健全。

- [ ] `src/main/stt/reconnect.ts`：計時 / 沉默偵測，逼近 ~5 分鐘上限前自動切段
- [ ] 切段時無縫開新 stream，緩衝跨段音訊不丟字
- [ ] 網路延遲 / 斷線：stream error → 自動重連 + UI 狀態提示
- [ ] 重連期間音訊緩衝與排空策略
- [ ] 長時間（>30 分鐘）連續聽寫壓力測試

完成條件：連續聽寫跨越多個 5 分鐘段落不中斷、不漏字。

---

## Phase P6：體驗完善（M6）

目標：全域快捷鍵啟停、即時草稿 UI、使用時長顯示。

- [ ] `src/main/shortcut.ts`：`globalShortcut` 啟停聽寫
- [ ] Renderer 即時草稿顯示（interim 灰字 / final 確定）
- [ ] 聽寫狀態指示（idle / listening / error）
- [ ] 使用時長顯示（對應 Google Cloud 計費）
- [ ] 語系切換 UI（`yue-Hant-HK` / `zh-TW` / `en-US`）
- [ ] （可選）月用量上限提示

完成條件：純鍵盤即可啟停聽寫，UI 即時反映狀態與時長。

---

## Phase P7：桌寵動畫（未來，M7）

目標：Live2D 桌寵動畫整合。

- [ ] 評估 Live2D Cubism SDK for Web 與 React 整合方式
- [ ] 浮動視窗改以 avatar 呈現
- [ ] 聽寫狀態驅動 avatar 動作（idle / listening / speaking）

完成條件：avatar 取代基本浮動視窗，並隨聽寫狀態動作。

---

## 風險追蹤（對應 plan_p1.md §7）

| 風險 | 對應 Phase | 狀態 |
| ---- | --------- | ---- |
| streaming ~5 分鐘上限 | P5 | `[ ]` |
| interim / final 重複注入 | P4 | `[ ]` |
| Service Account key 外洩 | P3 | `[ ]` |
| Clipboard 覆蓋使用者內容 | P4 | `[ ]` |
| 中文 / 標點注入相容性 | P4 | `[ ]` |
| 網路延遲 / 斷線 | P5 | `[ ]` |
| Google Cloud 費用 | P6 | `[ ]` |

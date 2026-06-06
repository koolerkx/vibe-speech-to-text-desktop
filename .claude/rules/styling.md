---
paths:
  - "src/renderer/**/*.tsx"
  - "src/renderer/**/*.css"
---

# Styling Rules

## Tailwind CSS

1. Renderer UI 一律使用 Tailwind CSS（v4）utility class 撰寫樣式，優先寫在 `className`。
2. 採用 `@tailwindcss/vite` plugin；CSS entry 以 `@import 'tailwindcss';` 引入，不使用 `tailwind.config.js` 或 PostCSS config，除非有 plugin / theme 需求才新增。
3. 不要新增一次性的 custom CSS class 取代可用 utility 表達的樣式（遵守 DRY，避免 class 與 utility 重複維護）。
4. 僅以下情況寫入 `index.css`：
   - global base（如 frameless transparent window 的 `body { background: transparent }`、`user-select`、font-family），放在 `@layer base`。
   - Tailwind 無法表達且跨多處重用的樣式，使用 `@layer components` 或 `@utility`。
5. Electron 專屬樣式（如 `-webkit-app-region`）以 Tailwind arbitrary property 撰寫：`[-webkit-app-region:drag]` / `[-webkit-app-region:no-drag]`。
6. 動態 class 組合使用條件運算或樣板字串；不要在 runtime 拼接出 Tailwind 無法靜態掃描的 class 名稱（會被 purge）。
7. 顏色 / 間距優先使用 Tailwind scale token；確有需要的固定值才用 arbitrary value（如 `bg-[rgba(24,26,32,0.92)]`）。

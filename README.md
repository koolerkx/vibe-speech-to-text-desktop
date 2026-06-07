# Speech to Text Desktop

Always-on-top speech-to-text desktop tool for Windows. It automatically types live recognition results into the currently focused text field (terminal, browser, editor, etc.), like the built-in voice input. Recognition is powered by Google Cloud Speech-to-Text.

## Features

- **Always-on-top floating window**: anchored at the bottom-right of the screen, collapsible to a single top bar; stays visible across workspaces and full-screen apps.
- **Auto-type into the focused field**: final results are injected into the active window via clipboard paste, working with any application.
- **Multi-language / multi-model**: Cantonese (`yue-Hant-HK`, v1), English (`en-US`), Japanese (`ja-JP`); offers v1 `latest_long` and v2 `long` / `chirp_3`, selected as presets.
- **Voice Activity Detection (VAD)**: closes the cloud stream during silence to stop billing, reopens automatically on speech, and keeps a preroll so the speech onset is not clipped.
- **Word boost**: phrase lists grouped by boost strength to bias recognition toward specific terms.
- **Word confidence**: final results carry per-word confidence values.
- **Usage stats**: accumulated recorded minutes per month.
- **Bring-Your-Own credentials**: users supply their own Google service account, stored encrypted on-device via the OS keystore (Windows DPAPI); the app bundles no credentials.
- **System tray**: resident in the tray; closing the window does not quit the app.

## Tech Stack

- Electron 42 + electron-vite
- React 19 + TypeScript
- Tailwind CSS v4 (`@tailwindcss/vite`)
- `@google-cloud/speech` (v1 + v2 streaming)
- electron-builder (NSIS installer)
- Yarn 4 (Berry, `node-modules` linker)

## Requirements

- Node.js 22
- Yarn 4 (via Corepack: `corepack enable`)
- Windows
- A Google Cloud service account with Speech-to-Text API access (see [Google Credentials](#google-credentials))

## Getting Started

```powershell
corepack enable
yarn install
yarn dev
```

`yarn dev` starts the electron-vite dev server and Electron.

## Google Credentials

The app uses your own Google Cloud service account. Credentials are never bundled into the app and never enter version control.

1. Enable the **Cloud Speech-to-Text API** in the Google Cloud Console.
2. Create a service account and download its JSON key (`key.json`).
3. Open the app and go to **Settings → Auth**:
   - **Upload key.json** to auto-fill the fields, or
   - enter **Project ID**, **Client Email**, and **Private Key** manually.
4. Click **Save**. Credentials are stored encrypted with DPAPI at `%APPDATA%\speech-to-text-desktop\credentials.json`.

> The private key is never returned to the renderer. Once configured, leaving the Private Key field blank and saving keeps the existing key, so you can edit Project ID / Client Email on their own.

During development, `scripts/stt-smoke.ts` reads `key.json` from the project root (listed in `.gitignore`).

## Build

```powershell
# Compile main / preload / renderer into out/
yarn build

# Compile and package with electron-builder into dist/
yarn dist
```

`yarn dist` outputs (`dist/`):

- `Speech to Text Setup <version>.exe` — NSIS installer
- `win-unpacked/` — portable directory containing a runnable `Speech to Text.exe`

## Distribution

| Method | How | Use case |
| --- | --- | --- |
| Installer | Distribute `Speech to Text Setup <version>.exe` | General distribution |
| Portable | Zip the entire `win-unpacked/` directory; extract and run | Quick testing |

Notes:

- Builds are unsigned, so users hit a Windows SmartScreen "unknown publisher" warning on first launch and must click **More info → Run anyway**.
- For portable builds, keep the whole folder together (`.exe` depends on the sibling DLLs, `resources/`, and `locales/`).
- User credentials and settings live under `%APPDATA%`, independent of the install/extract location; updating the app does not lose them.

## Scripts

| Script | Description |
| --- | --- |
| `yarn dev` | Start the dev server and Electron |
| `yarn build` | Compile into `out/` |
| `yarn preview` | Preview the production build |
| `yarn dist` | Compile and package with electron-builder |
| `yarn stt:smoke` | STT connection smoke test (needs `key.json` in the project root) |
| `yarn typecheck` | `tsc --noEmit` type check |

## Project Structure

```
src/
  main/            Electron main process
    stt/           Google STT v1/v2 transports, reconnect, streaming config
    settings/      Settings store and window
    credentials/   Encrypted service-account credential store and IPC
    inject/        Clipboard paste injection into the focused field
    audio/         PCM processing
    usage/         Recorded-minutes stats
  preload/         RendererApi exposed via contextBridge
  renderer/        React UI (floating window + Settings)
  shared/          Types and settings shared between main and renderer
scripts/           Dev tools (stt-smoke)
electron-builder.yml
```

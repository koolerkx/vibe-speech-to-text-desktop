export function App() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden rounded-2xl border border-white/10 bg-[rgba(24,26,32,0.92)] text-gray-200">
      <div className="flex items-center justify-between bg-white/[0.04] px-3 py-2 [-webkit-app-region:drag]">
        <span className="text-[13px] font-semibold">Speech to Text</span>
        <div className="flex gap-1.5 [-webkit-app-region:no-drag]">
          <button
            type="button"
            className="h-[22px] w-[22px] rounded-md bg-white/10 text-sm leading-none hover:bg-white/20"
            onClick={() => window.api.hideWindow()}
            aria-label="Hide"
          >
            –
          </button>
          <button
            type="button"
            className="h-[22px] w-[22px] rounded-md bg-white/10 text-sm leading-none hover:bg-white/20"
            onClick={() => window.api.quitApp()}
            aria-label="Quit"
          >
            ×
          </button>
        </div>
      </div>
      <main className="flex flex-1 flex-col items-center justify-center gap-2">
        <p className="text-xl font-semibold">Idle</p>
        <p className="text-xs text-gray-400">M1 skeleton — always on top</p>
      </main>
    </div>
  );
}

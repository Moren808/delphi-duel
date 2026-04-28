import { MeshStatusIndicator } from "./mesh-status";

export function Header() {
  return (
    <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-5">
        <div className="flex flex-col gap-0.5">
          <h1 className="font-mono text-2xl font-semibold tracking-tight text-slate-100">
            Delphi <span className="text-emerald-400">Duel</span>
          </h1>
          <p className="text-xs text-slate-400">
            get a second opinion before you bet
          </p>
        </div>
        <MeshStatusIndicator />
      </div>
    </header>
  );
}

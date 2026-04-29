import Image from "next/image";
import { MeshStatusIndicator } from "./mesh-status";
import { ThemeToggle } from "./theme-toggle";

export function Header() {
  return (
    <header className="border-b border-ink/10 dark:border-stone-100/10">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-6">
        <div className="flex items-center gap-5">
          <Image
            src="/logo.jpg"
            alt="Delphi Duel"
            width={96}
            height={96}
            priority
            // Logo is square (icon + wordmark). h-24 = 96px to match Delphi's
            // own oversized branding. dark:invert flips it for dark mode
            // (black-on-cream → near-white-on-black).
            className="h-24 w-auto dark:invert"
          />
          <p className="hidden text-base text-ink-muted dark:text-stone-400 md:block">
            get a second opinion before you bet
          </p>
        </div>
        <div className="flex items-center gap-3">
          <MeshStatusIndicator />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

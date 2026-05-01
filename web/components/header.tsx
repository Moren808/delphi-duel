"use client";

import { Settings as SettingsIcon } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { MeshStatusIndicator } from "./mesh-status";
import { SettingsModal } from "./settings-modal";
import { ThemeToggle } from "./theme-toggle";

export function Header() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <>
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
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="rounded-lg p-2 text-ink hover:bg-stone-100 dark:text-stone-100 dark:hover:bg-stone-800"
              aria-label="Bet settings"
              title="Bet settings"
            >
              <SettingsIcon className="h-5 w-5" />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

"use client";

import { Settings as SettingsIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { MeshStatusIndicator } from "./mesh-status";
import { SettingsModal } from "./settings-modal";
import { ThemeToggle } from "./theme-toggle";

const NAV: Array<{ href: string; label: string }> = [
  { href: "/", label: "duels" },
  { href: "/bets", label: "bets" },
];

export function Header() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <header className="border-b border-ink/10 dark:border-stone-100/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-6">
          <div className="flex items-center gap-5">
            <Link href="/" aria-label="home">
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
            </Link>
            <nav className="hidden items-center gap-4 md:flex">
              {NAV.map((item) => {
                const active =
                  item.href === "/" ? pathname === "/" : pathname?.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "font-mono text-sm transition",
                      active
                        ? "font-bold text-ink dark:text-stone-100"
                        : "text-ink-muted hover:text-ink dark:text-stone-400 dark:hover:text-stone-100",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
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

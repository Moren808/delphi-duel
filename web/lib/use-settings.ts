"use client";

/**
 * useSettings — read/write the dashboard's bet-control overrides.
 *
 * State precedence on first load:
 *   1. localStorage (instant, no flash)
 *   2. /api/settings (server-side settings.json — authoritative across tabs)
 *   3. Hard-coded defaults
 *
 * On every save: write localStorage AND POST to /api/settings so the
 * judge daemon picks up the change on its next bet attempt.
 */
import { useCallback, useEffect, useState } from "react";

export interface BetSettings {
  bet_size_usdc: number;
  auto_bet: boolean;
  min_confidence: number;
}

export const DEFAULT_SETTINGS: BetSettings = {
  bet_size_usdc: 1.0,
  auto_bet: true,
  min_confidence: 0.65,
};

export const SETTINGS_BOUNDS = {
  bet_size_usdc: { min: 0.5, max: 10 },
  min_confidence: { min: 0.6, max: 0.9 },
} as const;

const LS_KEY = "delphi-duel-bet-settings";

function readLocal(): Partial<BetSettings> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocal(s: BetSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

export function useSettings(): {
  settings: BetSettings;
  setSettings: (next: BetSettings) => Promise<void>;
  saving: boolean;
  saveError: string | null;
  /** True once we've attempted to hydrate from server. UI can wait if needed. */
  hydrated: boolean;
} {
  const [settings, setLocal] = useState<BetSettings>(() => ({
    ...DEFAULT_SETTINGS,
    ...readLocal(),
  }));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from server once on mount. Server is the source of truth
  // when localStorage is empty (e.g., first visit on a new browser).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { settings?: Partial<BetSettings> };
        if (cancelled) return;
        // Merge: server settings fill in any field the user hasn't set
        // locally yet. Existing local values win — they're more recent.
        const local = readLocal();
        const merged: BetSettings = {
          bet_size_usdc:
            local.bet_size_usdc ?? j.settings?.bet_size_usdc ?? DEFAULT_SETTINGS.bet_size_usdc,
          auto_bet:
            local.auto_bet ?? j.settings?.auto_bet ?? DEFAULT_SETTINGS.auto_bet,
          min_confidence:
            local.min_confidence ?? j.settings?.min_confidence ?? DEFAULT_SETTINGS.min_confidence,
        };
        setLocal(merged);
        writeLocal(merged);
      } catch {
        /* offline / API down — keep defaults */
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setSettings = useCallback(async (next: BetSettings) => {
    setSaving(true);
    setSaveError(null);
    setLocal(next);
    writeLocal(next);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, []);

  return { settings, setSettings, saving, saveError, hydrated };
}

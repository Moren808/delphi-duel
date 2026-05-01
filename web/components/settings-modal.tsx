"use client";

/**
 * Settings modal — adjusts judge bet behaviour without restarting the
 * daemon. Saves to localStorage AND POSTs /api/settings, which writes
 * <repo-root>/settings.json. The judge re-reads that file on every bet
 * attempt, so a save here takes effect on the next duel.
 */
import { motion } from "framer-motion";
import { Loader2, Save, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import {
  DEFAULT_SETTINGS,
  SETTINGS_BOUNDS,
  useSettings,
  type BetSettings,
} from "@/lib/use-settings";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: Props) {
  const { settings, setSettings, saving, saveError } = useSettings();
  // Local draft so editing the inputs doesn't fire a server write per keystroke.
  const [draft, setDraft] = useState<BetSettings>(settings);

  // Reset draft to current settings whenever the modal opens.
  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);

  // Esc to dismiss.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const dirty =
    draft.bet_size_usdc !== settings.bet_size_usdc ||
    draft.auto_bet !== settings.auto_bet ||
    draft.min_confidence !== settings.min_confidence;

  const betBounds = SETTINGS_BOUNDS.bet_size_usdc;
  const confBounds = SETTINGS_BOUNDS.min_confidence;

  const onSave = async () => {
    // Clamp to bounds defensively before sending.
    const clamped: BetSettings = {
      bet_size_usdc: Math.min(Math.max(draft.bet_size_usdc, betBounds.min), betBounds.max),
      auto_bet: draft.auto_bet,
      min_confidence: Math.min(Math.max(draft.min_confidence, confBounds.min), confBounds.max),
    };
    await setSettings(clamped);
    if (!saveError) onClose();
  };

  const onResetDefaults = () => setDraft(DEFAULT_SETTINGS);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-4 backdrop-blur-sm dark:bg-stone-950/80"
      role="dialog"
      aria-modal="true"
      aria-label="Bet settings"
      onClick={(e) => {
        // Click on backdrop closes; clicks inside the panel don't bubble.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-md rounded-2xl border-2 border-ink bg-white p-6 dark:border-stone-100 dark:bg-stone-900"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-ink-muted dark:text-stone-400">
              settings
            </p>
            <p className="font-mono text-xl font-bold text-ink dark:text-stone-100">
              bet controls
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-muted hover:bg-stone-100 hover:text-ink dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
            aria-label="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Bet size */}
        <div className="mb-5">
          <label
            className="block font-mono text-xs font-semibold uppercase tracking-wider text-ink dark:text-stone-100"
            htmlFor="bet-size"
          >
            bet size (usdc)
          </label>
          <p className="mt-0.5 text-xs text-ink-muted dark:text-stone-400">
            $0.50 – $10.00 per bet. Default $1.00.
          </p>
          <input
            id="bet-size"
            type="number"
            inputMode="decimal"
            min={betBounds.min}
            max={betBounds.max}
            step={0.5}
            value={draft.bet_size_usdc}
            onChange={(e) =>
              setDraft({ ...draft, bet_size_usdc: Number(e.target.value) })
            }
            className="mt-2 w-full rounded-lg border-2 border-ink bg-white px-3 py-2 font-mono text-base tabular-nums text-ink focus:outline-none focus:ring-2 focus:ring-emerald-400 dark:border-stone-100 dark:bg-stone-950 dark:text-stone-100"
          />
        </div>

        {/* Auto-bet toggle */}
        <div className="mb-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-xs font-semibold uppercase tracking-wider text-ink dark:text-stone-100">
                auto-bet
              </p>
              <p className="mt-0.5 text-xs text-ink-muted dark:text-stone-400">
                When off, the judge logs the verdict but never submits a tx.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={draft.auto_bet}
              onClick={() => setDraft({ ...draft, auto_bet: !draft.auto_bet })}
              className={cn(
                "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition",
                draft.auto_bet
                  ? "bg-emerald-500 dark:bg-emerald-400"
                  : "bg-stone-300 dark:bg-stone-700",
              )}
            >
              <span
                className={cn(
                  "inline-block h-5 w-5 transform rounded-full bg-white transition",
                  draft.auto_bet ? "translate-x-6" : "translate-x-1",
                )}
              />
            </button>
          </div>
        </div>

        {/* Min confidence slider */}
        <div className="mb-6">
          <label
            className="block font-mono text-xs font-semibold uppercase tracking-wider text-ink dark:text-stone-100"
            htmlFor="min-conf"
          >
            min confidence
            <span className="ml-2 font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
              {(draft.min_confidence * 100).toFixed(0)}%
            </span>
          </label>
          <p className="mt-0.5 text-xs text-ink-muted dark:text-stone-400">
            Below this, the judge skips the bet.
          </p>
          <input
            id="min-conf"
            type="range"
            min={confBounds.min}
            max={confBounds.max}
            step={0.01}
            value={draft.min_confidence}
            onChange={(e) =>
              setDraft({ ...draft, min_confidence: Number(e.target.value) })
            }
            className="mt-3 w-full accent-emerald-500 dark:accent-emerald-400"
          />
          <div className="mt-1 flex justify-between font-mono text-[10px] text-ink-muted dark:text-stone-400">
            <span>{(confBounds.min * 100).toFixed(0)}%</span>
            <span>{(confBounds.max * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* Errors */}
        {saveError && (
          <div className="mb-4 rounded-lg border border-rose-500 bg-rose-50 px-3 py-2 font-mono text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
            {saveError}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onResetDefaults}
            className="font-mono text-xs text-ink-muted underline-offset-2 hover:underline dark:text-stone-400"
          >
            reset defaults
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border-2 border-ink bg-white px-4 py-2 font-mono text-sm font-medium text-ink transition hover:bg-ink hover:text-cream dark:border-stone-100 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-100 dark:hover:text-stone-950"
            >
              cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!dirty || saving}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-sm font-medium",
                "bg-emerald-500 text-white transition hover:bg-emerald-600",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              save
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

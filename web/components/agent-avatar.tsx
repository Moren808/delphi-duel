import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AgentRole } from "@/lib/types";

interface Props {
  role: AgentRole;
  /** Adds a subtle pulse ring while it's the agent's turn. */
  thinking?: boolean;
  size?: "sm" | "md";
}

/**
 * Circular avatar — green up-arrow for bull, red down-arrow for bear.
 * Trading-terminal vibe; not literal animal mascots.
 */
export function AgentAvatar({ role, thinking = false, size = "md" }: Props) {
  const isBull = role === "bull";
  const dim = size === "sm" ? "h-8 w-8" : "h-12 w-12";
  const Icon = isBull ? TrendingUp : TrendingDown;
  const colors = isBull
    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
    : "border-rose-500/40 bg-rose-500/10 text-rose-400";
  const ringColor = isBull
    ? "ring-emerald-500/40"
    : "ring-rose-500/40";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border",
        dim,
        colors,
        thinking && cn("ring-2", ringColor, "animate-pulse"),
      )}
    >
      <Icon className={size === "sm" ? "h-4 w-4" : "h-6 w-6"} strokeWidth={2.5} />
    </span>
  );
}

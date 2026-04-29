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
 * Circular avatar — TrendingUp for bull (emerald accent), TrendingDown
 * for bear (rose accent). Subtle tinted background, role-colored icon.
 * Pulsing ring (matching the role color) when this agent is thinking.
 */
export function AgentAvatar({ role, thinking = false, size = "md" }: Props) {
  const isBull = role === "bull";
  const dim = size === "sm" ? "h-9 w-9" : "h-14 w-14";
  const Icon = isBull ? TrendingUp : TrendingDown;
  const colors = isBull
    ? "border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : "border-rose-500 bg-rose-500/10 text-rose-600 dark:text-rose-400";
  const pulseRing = isBull
    ? "ring-emerald-500/60"
    : "ring-rose-500/60";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border-2",
        dim,
        colors,
        thinking && cn("ring-2 animate-pulse", pulseRing),
      )}
    >
      <Icon className={size === "sm" ? "h-4 w-4" : "h-7 w-7"} strokeWidth={2.5} />
    </span>
  );
}

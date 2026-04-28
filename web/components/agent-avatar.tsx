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
 * Circular avatar — TrendingUp for bull, TrendingDown for bear. In the
 * monochrome theme bull is filled black-on-white, bear is the inverse
 * (white-on-black with a black border) — different shapes plus inverted
 * fill so they read distinctly without relying on hue.
 */
export function AgentAvatar({ role, thinking = false, size = "md" }: Props) {
  const isBull = role === "bull";
  const dim = size === "sm" ? "h-8 w-8" : "h-12 w-12";
  const Icon = isBull ? TrendingUp : TrendingDown;
  const colors = isBull
    ? "border-black bg-white text-black"
    : "border-black bg-black text-white";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border",
        dim,
        colors,
        thinking && "ring-2 ring-black animate-pulse",
      )}
    >
      <Icon className={size === "sm" ? "h-4 w-4" : "h-6 w-6"} strokeWidth={2.5} />
    </span>
  );
}

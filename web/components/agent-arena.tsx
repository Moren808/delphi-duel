"use client";

import { AgentCard } from "./agent-card";
import type { TurnRecord } from "@/lib/types";

interface Props {
  turns: TurnRecord[];
  /** True when a duel is running and we're between turns. */
  duelLive: boolean;
}

/**
 * The two-card stage. Reads the latest bull/bear turns out of the
 * transcript and computes the "thinking..." indicator for the agent
 * whose turn is next.
 *
 * Rule: bull opens at round 0 (even), bear takes odd rounds. Whoever
 * has produced *fewer or equal* turns is the one currently thinking,
 * provided the duel isn't over.
 */
export function AgentArena({ turns, duelLive }: Props) {
  const bullTurns = turns.filter((t) => t.role === "bull");
  const bearTurns = turns.filter((t) => t.role === "bear");

  const lastBull = bullTurns[bullTurns.length - 1] ?? null;
  const lastBear = bearTurns[bearTurns.length - 1] ?? null;

  const lastFinal = turns.find((t) => t.is_final);
  const duelOver = Boolean(lastFinal);

  // Whose turn is it? If duel is over, neither thinks. Otherwise, alternate
  // by next-expected round. If no bull turn yet, bull is thinking.
  let bullThinking = false;
  let bearThinking = false;
  if (duelLive && !duelOver) {
    if (!lastBull) {
      bullThinking = true;
    } else if (!lastBear || lastBear.round < lastBull.round) {
      bearThinking = true;
    } else {
      bullThinking = true;
    }
  }

  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <AgentCard
        role="bull"
        probability={lastBull?.probability ?? null}
        round={lastBull?.round ?? null}
        thinking={bullThinking}
      />
      <AgentCard
        role="bear"
        probability={lastBear?.probability ?? null}
        round={lastBear?.round ?? null}
        thinking={bearThinking}
      />
    </section>
  );
}

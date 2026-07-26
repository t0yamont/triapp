'use client';

/**
 * How hard did that session feel? — the sRPE capture (§5.1).
 *
 * Presentational: the write lives in `lib/rate-activity.ts`. Rendered on any list row that has no
 * rating yet, so a session can be rated whenever the athlete gets to it — not only in the moment
 * after an upload, which would leave `perceived_load` null forever on everything else.
 *
 * The framing matters as much as the number. Session RPE asks for the difficulty of the session
 * *as a whole*; an athlete who rates their hardest interval instead inflates the load on exactly
 * the sessions the plan most needs to read correctly.
 */

import { useState } from 'react';
import { RPE_SCALE } from '../../lib/rate-activity';

export function RpeControl({
  onRate,
  saving,
}: {
  onRate: (rpe: number) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-full border border-white/[0.08] px-2 py-0.5 text-[10px] font-semibold text-faint transition-colors hover:border-accent/40 hover:text-text"
        title="How hard did this session feel, as a whole? Adds sRPE — the load model that needs no sensor."
      >
        RATE
      </button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <span className="mr-1 hidden text-[10px] uppercase tracking-widest text-faint lg:inline">
        Whole session
      </span>
      {RPE_SCALE.map(({ value, anchor }) => (
        <button
          key={value}
          type="button"
          disabled={saving}
          onClick={() => onRate(value)}
          title={anchor ? `${value} — ${anchor}` : String(value)}
          className="h-6 w-6 rounded-control border border-white/[0.08] font-mono text-[11px] tabular-nums text-muted transition-colors hover:border-accent/50 hover:text-text disabled:opacity-40"
        >
          {value}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="ml-1 shrink-0 text-faint hover:text-text"
        aria-label="Cancel rating"
      >
        ✕
      </button>
    </div>
  );
}

import { Card, ConfidenceDot } from '@ironflow/ui';
import type { SZone } from '@ironflow/core/physio';
import type { PlannedSession, SessionInterval } from '../../lib/today-demo';

// Height reads intensity (S1 low, S3 full) — the shape bar is a silhouette of the session,
// not a precise power trace (§7.1).
const ZONE_BAR: Record<SZone, { heightPct: number; bg: string; edge: string; dot: string }> = {
  S1: { heightPct: 40, bg: 'bg-zone-z1/50', edge: 'shadow-[inset_0_1px_0_0_#6B7A90]', dot: 'bg-zone-z1' },
  S2: { heightPct: 78, bg: 'bg-zone-z3/85', edge: 'shadow-[inset_0_1px_0_0_#F4B740]', dot: 'bg-zone-z3' },
  S3: { heightPct: 100, bg: 'bg-zone-z5/85', edge: 'shadow-[inset_0_1px_0_0_#FF6B7A]', dot: 'bg-zone-z5' },
};

function durationLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
}

function ShapeBar({ intervals }: { intervals: SessionInterval[] }) {
  const total = intervals.reduce((a, iv) => a + iv.minutes, 0) || 1;
  return (
    <div className="flex h-16 items-end gap-0.5">
      {intervals.map((iv, i) => {
        const z = ZONE_BAR[iv.zone];
        return (
          <div
            key={i}
            className={`rounded-t-[3px] rounded-b-[2px] ${z.bg} ${z.edge}`}
            style={{ width: `${(iv.minutes / total) * 100}%`, height: `${z.heightPct}%` }}
          />
        );
      })}
    </div>
  );
}

/** "Session shape & targets" — the interval silhouette plus the structured target list (§7.1). */
export function SessionShapePanel({ session }: { session: PlannedSession }) {
  return (
    <Card className="flex flex-col gap-4">
      <span className="text-label uppercase tracking-widest text-faint">Session shape &amp; targets</span>

      <ShapeBar intervals={session.intervals} />
      <div className="flex justify-between font-mono text-[11px] text-faint">
        <span>0:00</span>
        <span>{durationLabel(session.durationMin)}</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {session.targetRows.map((t, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 border-b border-white/[0.05] pb-2 last:border-b-0 last:pb-0">
            <span className="inline-flex items-center gap-2 text-label text-muted">
              <span className={`h-1.5 w-1.5 rounded-[2px] ${ZONE_BAR[t.zone].dot}`} aria-hidden />
              {t.label}
            </span>
            <span className="font-mono text-mono tabular-nums text-text">{t.value}</span>
          </div>
        ))}
      </div>

      {/* The note travels with the session, so a live one can't inherit the sample's claim of a
          ramp test that never happened. */}
      <ConfidenceDot confidence={session.targetsConfidence} label={session.targetsNote} />
    </Card>
  );
}

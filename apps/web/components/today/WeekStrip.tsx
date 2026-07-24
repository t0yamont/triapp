import { Card } from '@ironflow/ui';
import type { Distribution } from '@ironflow/core/physio';
import type { WeekStripView } from '../../lib/today-demo';

const ZONE_BG: Record<keyof Distribution, string> = { S1: 'bg-zone-z1', S2: 'bg-zone-z3', S3: 'bg-zone-z5' };
const ZONES: (keyof Distribution)[] = ['S1', 'S2', 'S3'];

/** "This week" — the load bars plus a one-line intensity-mix caption (§4.8, §5.3 G6/G7). */
export function WeekStrip({ week }: { week: WeekStripView }) {
  const max = Math.max(1, ...week.days.map((d) => Math.max(d.plannedLoad, d.doneLoad)));
  const pct = Math.round((week.doneTotal / Math.max(1, week.plannedTotal)) * 100);
  const actual = week.distributionActual;
  const target = week.distributionTarget;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label uppercase tracking-widest text-faint">This week</span>
        <span className="font-mono text-label tabular-nums text-muted">{pct}%</span>
      </div>

      <span className="font-mono text-h1 tabular-nums text-text">
        {week.doneTotal} <span className="text-faint">/ {week.plannedTotal} load</span>
      </span>

      <div className="flex items-end gap-2" style={{ height: 104 }}>
        {week.days.map((d) => (
          <div key={d.index} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <div className="relative w-full max-w-[30px] flex-1 self-center overflow-hidden rounded-[4px]">
              <span className="absolute bottom-0 w-full rounded-[4px] bg-white/[0.06]" style={{ height: `${(d.plannedLoad / max) * 100}%` }} />
              <span
                className={`absolute bottom-0 w-full rounded-[4px] ${d.isToday ? 'bg-accent shadow-[0_0_16px_rgba(109,139,255,0.6)]' : 'bg-white/25'}`}
                style={{ height: `${(d.doneLoad / max) * 100}%` }}
              />
            </div>
            <span className={`text-label ${d.isToday ? 'font-semibold text-accent-bright' : 'text-faint'}`}>{d.short}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 pt-0.5">
        <div className="flex h-2.5 gap-[3px]">
          {ZONES.map((z) => (
            <span key={z} className={`${ZONE_BG[z]} first:rounded-l-[5px] last:rounded-r-[5px]`} style={{ width: `${actual[z]}%` }} />
          ))}
        </div>
        <span className="font-mono text-[11px] text-faint">
          S1 {actual.S1} · S2 {actual.S2} · S3 {actual.S3} — target {target.S1} / {target.S2} / {target.S3}
        </span>
      </div>
    </Card>
  );
}

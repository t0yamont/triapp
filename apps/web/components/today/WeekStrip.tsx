import { Card } from '@ironflow/ui';
import type { Distribution } from '@ironflow/core/physio';
import type { WeekStripView } from '../../lib/today-demo';

const ZONE_BG: Record<keyof Distribution, string> = { S1: 'bg-zone-z1', S2: 'bg-zone-z3', S3: 'bg-zone-z5' };
const ZONES: (keyof Distribution)[] = ['S1', 'S2', 'S3'];

function DistributionBar({ actual, target }: { actual: Distribution; target: Distribution }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-label uppercase tracking-widest text-faint">Intensity mix</span>
        <span className="font-mono text-label tabular-nums text-faint">
          target {target.S1}/{target.S2}/{target.S3}
        </span>
      </div>
      <div className="relative flex h-2.5 overflow-hidden rounded-full bg-white/[0.05]" role="img" aria-label="Zone distribution vs target">
        {ZONES.map((z) => (
          <span key={z} className={ZONE_BG[z]} style={{ width: `${actual[z]}%` }} />
        ))}
      </div>
      <div className="flex gap-4">
        {ZONES.map((z) => (
          <span key={z} className="inline-flex items-center gap-1.5 text-label text-muted">
            <span className={`h-2 w-2 rounded-[3px] ${ZONE_BG[z]}`} aria-hidden />
            {z} <span className="font-mono tabular-nums text-text">{actual[z]}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function WeekStrip({ week }: { week: WeekStripView }) {
  const max = Math.max(1, ...week.days.map((d) => Math.max(d.plannedLoad, d.doneLoad)));
  const pct = Math.round((week.doneTotal / Math.max(1, week.plannedTotal)) * 100);

  return (
    <Card className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <span className="text-label uppercase tracking-widest text-faint">This week</span>
        <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1 text-label text-muted">
          <span className="font-mono tabular-nums text-text">{week.doneTotal}</span>
          <span className="text-faint">/ {week.plannedTotal} load</span>
          <span className="text-accent-bright">{pct}%</span>
        </span>
      </div>

      <div className="flex items-end gap-2.5" style={{ height: 116 }}>
        {week.days.map((d) => (
          <div key={d.index} className="flex h-full flex-1 flex-col items-center justify-end gap-2.5">
            <div className="relative w-full max-w-[34px] flex-1 self-center overflow-hidden rounded-[6px]">
              <span className="absolute bottom-0 w-full rounded-[6px] bg-white/[0.06]" style={{ height: `${(d.plannedLoad / max) * 100}%` }} />
              <span
                className={`absolute bottom-0 w-full rounded-[6px] ${d.isToday ? 'bg-accent shadow-[0_0_16px_rgba(109,139,255,0.6)]' : 'bg-white/25'}`}
                style={{ height: `${(d.doneLoad / max) * 100}%` }}
              />
            </div>
            <span className={`text-label ${d.isToday ? 'font-semibold text-accent-bright' : 'text-faint'}`}>{d.short}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4 text-label text-faint">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-[3px] bg-white/25" aria-hidden /> completed
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-3 rounded-[3px] bg-white/[0.06] ring-1 ring-inset ring-white/10" aria-hidden /> planned
        </span>
      </div>

      <div className="hairline" />
      <DistributionBar actual={week.distributionActual} target={week.distributionTarget} />
    </Card>
  );
}

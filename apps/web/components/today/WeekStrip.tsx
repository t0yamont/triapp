import { Card } from '@ironflow/ui';
import type { Distribution } from '@ironflow/core/physio';
import type { WeekStripView } from '../../lib/today-demo';

const ZONE_BG: Record<keyof Distribution, string> = { S1: 'bg-zone-z1', S2: 'bg-zone-z3', S3: 'bg-zone-z5' };
const ZONES: (keyof Distribution)[] = ['S1', 'S2', 'S3'];

function DistributionBar({ actual, target }: { actual: Distribution; target: Distribution }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-label text-faint">Intensity mix (S1 / S2 / S3)</span>
        <span className="font-mono text-label text-faint">
          target {target.S1}/{target.S2}/{target.S3}
        </span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-raised" role="img" aria-label="Zone distribution">
        {ZONES.map((z) => (
          <span key={z} className={ZONE_BG[z]} style={{ width: `${actual[z]}%` }} />
        ))}
      </div>
      <div className="flex gap-4">
        {ZONES.map((z) => (
          <span key={z} className="inline-flex items-center gap-1.5 text-label text-muted">
            <span className={`h-2 w-2 rounded-sm ${ZONE_BG[z]}`} aria-hidden />
            {z} {actual[z]}%
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
    <Card className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-h2 text-text">This week</h2>
        <span className="text-label text-muted">
          <span className="font-mono text-text">{week.doneTotal}</span> / {week.plannedTotal} load · {pct}%
        </span>
      </div>

      <div className="flex gap-2" style={{ height: 112 }}>
        {week.days.map((d) => (
          <div key={d.index} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <div className="relative w-full max-w-[36px] flex-1 self-center">
              {/* planned = track, done = filled overlay */}
              <span
                className="absolute bottom-0 w-full rounded-t bg-white/10"
                style={{ height: `${(d.plannedLoad / max) * 100}%` }}
              />
              <span
                className={`absolute bottom-0 w-full rounded-t ${d.isToday ? 'bg-accent' : 'bg-muted/60'}`}
                style={{ height: `${(d.doneLoad / max) * 100}%` }}
              />
            </div>
            <span className={`text-label ${d.isToday ? 'text-accent' : 'text-faint'}`}>{d.short}</span>
          </div>
        ))}
      </div>

      <DistributionBar actual={week.distributionActual} target={week.distributionTarget} />
    </Card>
  );
}

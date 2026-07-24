import { Card } from '@ironflow/ui';
import type { Distribution } from '@ironflow/core/physio';

const ZONE_BG: Record<keyof Distribution, string> = { S1: 'bg-zone-z1', S2: 'bg-zone-z3', S3: 'bg-zone-z5' };
const ZONES: (keyof Distribution)[] = ['S1', 'S2', 'S3'];

function Bar({ dist }: { dist: Distribution }) {
  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
      {ZONES.map((z) => (
        <span key={z} className={ZONE_BG[z]} style={{ width: `${dist[z]}%` }} />
      ))}
    </div>
  );
}

export function DistributionCard({
  actual,
  target,
  withinTolerance,
  moderateDrift,
}: {
  actual: Distribution;
  target: Distribution;
  withinTolerance: boolean;
  moderateDrift: boolean;
}) {
  const status = moderateDrift
    ? { label: 'S2 drift', tone: 'text-warn', dot: 'bg-warn' }
    : withinTolerance
      ? { label: 'On target', tone: 'text-ok', dot: 'bg-ok' }
      : { label: 'Adjusting mix', tone: 'text-warn', dot: 'bg-warn' };

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <span className="text-label uppercase tracking-widest text-faint">Intensity distribution · 3-wk</span>
        <span className={`inline-flex items-center gap-1.5 text-label ${status.tone}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden />
          {status.label}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-label text-muted">Actual</span>
        <Bar dist={actual} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-label text-faint">Target</span>
        <div className="opacity-55">
          <Bar dist={target} />
        </div>
      </div>

      <div className="flex gap-4">
        {ZONES.map((z) => (
          <span key={z} className="inline-flex items-center gap-1.5 text-label text-muted">
            <span className={`h-2 w-2 rounded-[3px] ${ZONE_BG[z]}`} aria-hidden />
            {z} <span className="font-mono tabular-nums text-text">{actual[z]}%</span>
            <span className="font-mono text-faint">/ {target[z]}</span>
          </span>
        ))}
      </div>
    </Card>
  );
}

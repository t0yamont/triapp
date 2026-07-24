import { Card } from '@ironflow/ui';
import type { Distribution } from '@ironflow/core/physio';

const ZONE_BG: Record<keyof Distribution, string> = { S1: 'bg-zone-z1', S2: 'bg-zone-z3', S3: 'bg-zone-z5' };
const ZONE_LABEL: Record<keyof Distribution, string> = { S1: 'S1 Aerobic', S2: 'S2 Threshold', S3: 'S3 VO₂' };
const ZONES: (keyof Distribution)[] = ['S1', 'S2', 'S3'];

function Bar({ dist }: { dist: Distribution }) {
  return (
    <div className="flex h-2.5 gap-[3px]">
      {ZONES.map((z) => (
        <span key={z} className={`${ZONE_BG[z]} first:rounded-l-[5px] last:rounded-r-[5px]`} style={{ width: `${dist[z]}%` }} />
      ))}
    </div>
  );
}

export function DistributionCard({
  actual,
  target,
  withinTolerance,
  moderateDrift,
  narrative,
}: {
  actual: Distribution;
  target: Distribution;
  withinTolerance: boolean;
  moderateDrift: boolean;
  narrative: string;
}) {
  const status = moderateDrift
    ? { label: 'S2 drift', tone: 'text-warn' }
    : withinTolerance
      ? { label: 'On target', tone: 'text-ok' }
      : { label: 'Adjusting mix', tone: 'text-warn' };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label uppercase tracking-widest text-faint">Intensity split · rolling 3 weeks</span>
        <span className={`text-label ${status.tone}`}>{status.label}</span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-label text-muted">Actual</span>
          <span className="font-mono text-label tabular-nums text-text">
            {actual.S1} / {actual.S2} / {actual.S3}
          </span>
        </div>
        <Bar dist={actual} />
        <div className="flex items-baseline justify-between">
          <span className="text-label text-muted">Target</span>
          <span className="font-mono text-label tabular-nums text-faint">
            {target.S1} / {target.S2} / {target.S3}
          </span>
        </div>
        <Bar dist={target} />
      </div>

      <div className="flex gap-4">
        {ZONES.map((z) => (
          <span key={z} className="inline-flex items-center gap-1.5 text-label text-muted">
            <span className={`h-2 w-2 rounded-[3px] ${ZONE_BG[z]}`} aria-hidden />
            {ZONE_LABEL[z]}
          </span>
        ))}
      </div>

      <p className="text-body text-muted">{narrative}</p>
    </Card>
  );
}

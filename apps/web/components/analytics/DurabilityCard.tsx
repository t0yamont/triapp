import { Card } from '@ironflow/ui';
import type { DurabilityResponse } from '@ironflow/core/physio';

function Sparkline({ values }: { values: number[] }) {
  const W = 108;
  const H = 34;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(0.001, max - min);
  const pts = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * W;
      const y = H - 3 - ((v - min) / span) * (H - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[34px] w-[108px]" aria-hidden>
      <polyline points={pts} fill="none" stroke="#F4B740" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DurabilityCard({
  latestPct,
  valid,
  exceedsTarget,
  trend,
  response,
}: {
  latestPct: number;
  valid: boolean;
  exceedsTarget: boolean;
  trend: number[];
  response: DurabilityResponse;
}) {
  const tone = exceedsTarget ? 'text-warn' : 'text-ok';
  const improving = trend.length >= 2 && trend[trend.length - 1]! < trend[0]!;

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <span className="text-label uppercase tracking-widest text-faint">Durability · decoupling</span>
        <span className="text-label text-faint">long rides ≥75 min</span>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="flex items-end gap-2">
          <span className={`text-stat leading-none tabular-nums ${tone}`}>{latestPct.toFixed(1)}</span>
          <span className="pb-1.5 text-h2 text-faint">%</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Sparkline values={trend} />
          <span className="text-label text-faint">{improving ? 'improving' : 'holding'} · target &lt;5%</span>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-control border border-white/[0.06] bg-white/[0.02] p-3.5">
        <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${exceedsTarget ? 'bg-warn/15 text-warn' : 'bg-ok/15 text-ok'}`}>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            {exceedsTarget ? <path d="M10 3v8M6 7l4 4 4-4M4 16h12" /> : <path d="M5 10.5l3.5 3.5L15 6.5" />}
          </svg>
        </span>
        <p className="text-body text-text/90">{valid ? response.reasonText : 'No valid long-ride reading yet this block.'}</p>
      </div>
    </Card>
  );
}

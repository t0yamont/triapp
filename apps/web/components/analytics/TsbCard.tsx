import { Card } from '@ironflow/ui';
import type { FitnessPoint } from '@ironflow/core/physio';

function TsbChart({ series }: { series: FitnessPoint[] }) {
  const W = 380;
  const H = 120;
  const px = 4;
  const n = series.length;
  const values = series.map((p) => p.tsb);
  const lo = Math.min(-5, ...values) * 1.15;
  const hi = Math.max(5, ...values) * 1.15;

  const x = (i: number) => px + (i / Math.max(1, n - 1)) * (W - 2 * px);
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const zeroY = y(0);

  const pts = values.map((v, i) => [x(i), y(v)] as const);
  const line = pts.map(([X, Y]) => `${X.toFixed(1)},${Y.toFixed(1)}`).join(' L ');
  const areaPath = `M ${pts[0]![0].toFixed(1)},${zeroY.toFixed(1)} L ${line} L ${pts[n - 1]![0].toFixed(1)},${zeroY.toFixed(1)} Z`;
  const last = pts[n - 1]!;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" preserveAspectRatio="none" role="img" aria-label="Training stress balance (form) over the last 12 weeks">
      <defs>
        <linearGradient id="tsb-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F4B740" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#F4B740" stopOpacity="0.03" />
        </linearGradient>
      </defs>
      <line x1={px} y1={zeroY} x2={W - px} y2={zeroY} stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
      <path d={areaPath} fill="url(#tsb-fill)" />
      <polyline points={`M ${line}`.slice(2)} fill="none" stroke="#F4B740" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill="#F4B740" stroke="#0B0D14" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * "Form · TSB" — a dedicated view of training stress balance, since it reads sub-zero during
 * a build block by design (§5.2) and deserves its own zero-baselined chart, not just a stat tile.
 */
export function TsbCard({ series, narrative }: { series: FitnessPoint[]; narrative: string }) {
  const tsb = series[series.length - 1]?.tsb ?? 0;
  const tone = tsb > 5 ? 'text-ok' : tsb < -10 ? 'text-warn' : 'text-accent-bright';

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label uppercase tracking-widest text-faint">Form · TSB, 12 weeks</span>
        <span className={`font-mono text-label tabular-nums ${tone}`}>{tsb > 0 ? `+${Math.round(tsb)}` : Math.round(tsb)}</span>
      </div>
      <TsbChart series={series} />
      <p className="text-body text-muted">{narrative}</p>
    </Card>
  );
}

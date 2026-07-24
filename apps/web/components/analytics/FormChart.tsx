import type { FitnessPoint } from '@ironflow/core/physio';

/**
 * CTL (fitness) as a filled area, ATL (fatigue) as a line, over the block. Presentational only —
 * the series comes from the engine's `fitnessSeries`. Fixed viewBox, scales to its container.
 */
export function FormChart({ series }: { series: FitnessPoint[] }) {
  const W = 760;
  const H = 230;
  const pt = 14;
  const pb = 22;
  const px = 6;
  const n = series.length;
  const maxY = Math.max(1, ...series.map((p) => Math.max(p.ctl, p.atl))) * 1.12;

  const x = (i: number) => px + (i / Math.max(1, n - 1)) * (W - 2 * px);
  const y = (v: number) => H - pb - (v / maxY) * (H - pt - pb);

  const ctlPts = series.map((p, i) => [x(i), y(p.ctl)] as const);
  const atlPts = series.map((p, i) => [x(i), y(p.atl)] as const);
  const line = (pts: readonly (readonly [number, number])[]) => pts.map(([X, Y]) => `${X.toFixed(1)},${Y.toFixed(1)}`).join(' ');
  const areaPath =
    `M ${ctlPts[0]![0].toFixed(1)},${(H - pb).toFixed(1)} ` +
    ctlPts.map(([X, Y]) => `L ${X.toFixed(1)},${Y.toFixed(1)}`).join(' ') +
    ` L ${ctlPts[n - 1]![0].toFixed(1)},${(H - pb).toFixed(1)} Z`;

  const gridYs = [0.25, 0.5, 0.75].map((f) => H - pb - f * (H - pt - pb));
  const lastCtl = ctlPts[n - 1]!;
  const lastAtl = atlPts[n - 1]!;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" preserveAspectRatio="none" role="img" aria-label="Fitness (CTL) and fatigue (ATL) over the last 12 weeks">
      <defs>
        <linearGradient id="ctl-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6D8BFF" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#6D8BFF" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {gridYs.map((gy, i) => (
        <line key={i} x1={px} y1={gy} x2={W - px} y2={gy} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      ))}
      <path d={areaPath} fill="url(#ctl-fill)" />
      <polyline points={line(ctlPts)} fill="none" stroke="#8AA0FF" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <polyline points={line(atlPts)} fill="none" stroke="#F4B740" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" strokeOpacity="0.9" vectorEffect="non-scaling-stroke" strokeDasharray="1 0" />
      <circle cx={lastAtl[0]} cy={lastAtl[1]} r="3.5" fill="#F4B740" />
      <circle cx={lastCtl[0]} cy={lastCtl[1]} r="4" fill="#8AA0FF" stroke="#0B0D14" strokeWidth="1.5" />
    </svg>
  );
}

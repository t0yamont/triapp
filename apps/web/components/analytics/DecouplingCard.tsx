import { Card } from '@ironflow/ui';
import type { DurabilityResponse } from '@ironflow/core/physio';

const DECOUPLING_LIMIT_PCT = 5; // §11 target — cited from the engine's DECOUPLING_TARGET_PCT.

function DecouplingChart({ trend }: { trend: number[] }) {
  const W = 380;
  const H = 100;
  const px = 4;
  const hi = Math.max(DECOUPLING_LIMIT_PCT * 1.3, ...trend) * 1.05;
  const n = trend.length;

  const x = (i: number) => px + (i / Math.max(1, n - 1)) * (W - 2 * px);
  const y = (v: number) => H - (v / hi) * H;
  const limitY = y(DECOUPLING_LIMIT_PCT);

  const pts = trend.map((v, i) => [x(i), y(v)] as const);
  const line = pts.map(([X, Y]) => `${X.toFixed(1)},${Y.toFixed(1)}`).join(' L ');
  const areaPath = `M ${pts[0]![0].toFixed(1)},${H} L ${line} L ${pts[n - 1]![0].toFixed(1)},${H} Z`;
  const last = pts[n - 1]!;
  const overLimit = (trend[n - 1] ?? 0) > DECOUPLING_LIMIT_PCT;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" preserveAspectRatio="none" role="img" aria-label="Aerobic decoupling trend across recent long sessions">
      <defs>
        <linearGradient id="dec-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={overLimit ? '#F4B740' : '#35D6A4'} stopOpacity="0.28" />
          <stop offset="100%" stopColor={overLimit ? '#F4B740' : '#35D6A4'} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line x1={px} y1={limitY} x2={W - px} y2={limitY} stroke="rgba(244,183,64,0.5)" strokeWidth="1" strokeDasharray="4 3" />
      <path d={areaPath} fill="url(#dec-fill)" />
      <polyline
        points={`M ${line}`.slice(2)}
        fill="none"
        stroke={overLimit ? '#F4B740' : '#35D6A4'}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={last[0]} cy={last[1]} r="3.5" fill={overLimit ? '#F4B740' : '#35D6A4'} stroke="#0B0D14" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * "Aerobic decoupling" — the §11 durability signal from `durability/decoupling.ts`. Deliberately
 * scoped to the one metric the engine actually computes; a separate 0–1 "durability index" isn't
 * a function the engine exposes yet, so it isn't fabricated here (CLAUDE.md "no invented
 * constants" — the same discipline applies to inventing a whole metric, not just a number).
 */
export function DecouplingCard({
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

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label uppercase tracking-widest text-faint">Aerobic decoupling</span>
        <span className={`font-mono text-label tabular-nums ${tone}`}>
          {latestPct.toFixed(1)}% · {exceedsTarget ? 'over limit' : 'within limit'}
        </span>
      </div>

      <DecouplingChart trend={trend} />
      <span className="font-mono text-[11px] text-faint">{DECOUPLING_LIMIT_PCT}% limit · long rides ≥75 min</span>

      <p className="text-body text-muted">{valid ? response.reasonText : 'No valid long-ride reading yet this block.'}</p>
    </Card>
  );
}

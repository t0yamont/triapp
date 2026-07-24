import { Card } from '@ironflow/ui';
import type { Readiness, ReadinessComponent } from '@ironflow/core/physio';

const BAND_TEXT: Record<string, string> = {
  below: 'text-warn',
  within: 'text-accent-bright',
  above: 'text-ok',
  unknown: 'text-faint',
};
const BAND_LABEL: Record<string, string> = {
  below: 'Below range',
  within: 'In range',
  above: 'Above range',
  unknown: 'No data',
};
const COMPONENT_LABEL: Record<ReadinessComponent['key'], string> = {
  hrv: 'HRV',
  restingHr: 'Resting HR',
  sleep: 'Sleep',
  wellness: 'Wellness',
  completion: 'Completion',
};
const DOT: Record<string, string> = {
  below: 'bg-warn shadow-[0_0_10px_rgba(244,183,64,0.8)]',
  within: 'bg-accent shadow-[0_0_10px_rgba(109,139,255,0.9)]',
  above: 'bg-ok shadow-[0_0_10px_rgba(53,214,164,0.8)]',
  unknown: 'bg-faint',
};
// Per-band ring gradient — the instrument reads state, then goes premium.
const RING_STOPS: Record<string, [string, string]> = {
  below: ['#F4B740', '#FF6B7A'],
  within: ['#7C6CF5', '#34E0C8'],
  above: ['#35D6A4', '#6D8BFF'],
  unknown: ['#3A4152', '#3A4152'],
};

/** Position 0–100% of a standardised deviation on a ±2.5 SD track (50% = baseline). */
function markerPct(z: number): number {
  return 50 + (Math.max(-2.5, Math.min(2.5, z)) / 2.5) * 50;
}

function Ring({ score, band }: { score: number; band: string }) {
  const size = 172;
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = band === 'unknown' ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const [from, to] = RING_STOPS[band] ?? RING_STOPS.unknown!;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`ring-${band}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#ring-${band})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ filter: 'drop-shadow(0 0 6px rgba(109,139,255,0.35))' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-stat tabular-nums ${BAND_TEXT[band]}`}>{band === 'unknown' ? '—' : score}</span>
        <span className="text-label uppercase tracking-widest text-faint">Readiness</span>
      </div>
    </div>
  );
}

function ComponentRow({ c }: { c: ReadinessComponent }) {
  return (
    <div className="grid grid-cols-[76px_1fr_82px] items-center gap-3">
      <span className="text-label text-muted">{COMPONENT_LABEL[c.key]}</span>
      <div className="relative h-1.5 rounded-full bg-white/[0.06]" aria-hidden>
        <span className="absolute inset-y-0 left-[40%] right-[40%] rounded-full bg-white/[0.09]" />
        <span className="absolute inset-y-[-3px] left-1/2 w-px -translate-x-1/2 bg-white/25" />
        <span
          className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-[#0b0d14] ${DOT[c.band]}`}
          style={{ left: `${markerPct(c.z)}%` }}
        />
      </div>
      <span className={`text-right text-label ${BAND_TEXT[c.band]}`}>{BAND_LABEL[c.band]}</span>
    </div>
  );
}

export function ReadinessCard({ readiness }: { readiness: Readiness }) {
  const { score, band, components } = readiness;
  return (
    <Card className="flex flex-col items-center gap-6">
      <div className="flex w-full items-baseline justify-between">
        <h2 className="text-h2 text-text">Readiness</h2>
        <span className={`text-label ${BAND_TEXT[band]}`}>{BAND_LABEL[band]}</span>
      </div>

      <Ring score={score} band={band} />

      {components.length > 0 ? (
        <div className="flex w-full flex-col gap-3">
          {components.map((c) => (
            <ComponentRow key={c.key} c={c} />
          ))}
        </div>
      ) : (
        <p className="text-body text-muted">Connect a wearable or log daily wellness to see your readiness.</p>
      )}

      <p className="w-full text-label text-faint">
        Scored against your own 60-day baseline with a smallest-worthwhile-change band — never a single day.
      </p>
    </Card>
  );
}

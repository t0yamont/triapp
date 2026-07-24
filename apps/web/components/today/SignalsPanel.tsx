import { Card } from '@ironflow/ui';
import type { ReadinessComponent } from '@ironflow/core/physio';

const BAND_TEXT: Record<string, string> = {
  below: 'text-warn',
  within: 'text-accent-bright',
  above: 'text-ok',
};
const BAND_LABEL: Record<string, string> = {
  below: 'Below range',
  within: 'In range',
  above: 'Above range',
};
const DOT: Record<string, string> = {
  below: 'bg-warn shadow-[0_0_9px_rgba(244,183,64,0.75)]',
  within: 'bg-accent shadow-[0_0_9px_rgba(109,139,255,0.85)]',
  above: 'bg-ok shadow-[0_0_9px_rgba(53,214,164,0.75)]',
};
const COMPONENT_LABEL: Record<ReadinessComponent['key'], string> = {
  hrv: 'HRV',
  restingHr: 'Resting HR',
  sleep: 'Sleep',
  wellness: 'Wellness',
  completion: 'Completion',
};

/** Position 0–100% of a standardised deviation on a ±2.5 SD track (50% = baseline). */
function markerPct(z: number): number {
  return 50 + (Math.max(-2.5, Math.min(2.5, z)) / 2.5) * 50;
}

function SignalRow({ c }: { c: ReadinessComponent }) {
  const sign = c.z >= 0 ? '+' : '';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label text-text">{COMPONENT_LABEL[c.key]}</span>
        <span className={`font-mono text-label ${BAND_TEXT[c.band]}`}>
          {sign}
          {c.z.toFixed(1)} σ · {BAND_LABEL[c.band]}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-white/[0.07]">
        <span className="absolute inset-y-0 left-[38%] w-[24%] rounded-full bg-white/[0.13]" aria-hidden />
        <span className="absolute inset-y-[-3px] left-1/2 w-px -translate-x-1/2 bg-white/20" aria-hidden />
        <span
          className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${DOT[c.band]}`}
          style={{ left: `${markerPct(c.z)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * "Signals behind the score" — the per-component evidence the readiness score is built from.
 * Never the score alone (§16, P2): this is the panel that makes that rule visible.
 */
export function SignalsPanel({ components }: { components: ReadinessComponent[] }) {
  return (
    <Card className="flex flex-col gap-4">
      <span className="text-label uppercase tracking-widest text-faint">Signals behind the score</span>
      {components.length > 0 ? (
        <div className="flex flex-col gap-3.5">
          {components.map((c) => (
            <SignalRow key={c.key} c={c} />
          ))}
        </div>
      ) : (
        <p className="text-body text-muted">Connect a wearable or log daily wellness to see what's behind your score.</p>
      )}
      <p className="text-label text-faint">
        The lighter middle band is the change worth reacting to. Inside it, we leave your plan alone.
      </p>
    </Card>
  );
}

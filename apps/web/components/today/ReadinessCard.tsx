import { Card } from '@ironflow/ui';
import type { Readiness, ReadinessComponent } from '@ironflow/core/physio';

const BAND_TEXT: Record<string, string> = {
  below: 'text-warn',
  within: 'text-text',
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

/** Position 0–100% of a standardised deviation on a ±2.5 SD track (50% = baseline). */
function markerPct(z: number): number {
  const clamped = Math.max(-2.5, Math.min(2.5, z));
  return 50 + (clamped / 2.5) * 50;
}

const DOT: Record<string, string> = {
  below: 'bg-warn',
  within: 'bg-accent',
  above: 'bg-ok',
  unknown: 'bg-faint',
};

function ComponentRow({ c }: { c: ReadinessComponent }) {
  return (
    <div className="grid grid-cols-[88px_1fr_84px] items-center gap-3">
      <span className="text-label text-muted">{COMPONENT_LABEL[c.key]}</span>
      <div className="relative h-1.5 rounded-full bg-raised" aria-hidden>
        {/* smallest-worthwhile-change band: ±0.5 SD around baseline (§10.1) */}
        <span className="absolute inset-y-0 left-[40%] right-[40%] rounded-full bg-white/10" />
        {/* baseline tick at the centre of the band */}
        <span className="absolute inset-y-[-2px] left-1/2 w-px -translate-x-1/2 bg-white/25" />
        <span
          className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${DOT[c.band]}`}
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
    <Card className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-h2 text-text">Readiness</h2>
        <span className={`text-label ${BAND_TEXT[band]}`}>{BAND_LABEL[band]}</span>
      </div>

      <div className="flex items-end gap-3">
        <span className={`text-display leading-none ${BAND_TEXT[band]}`}>{band === 'unknown' ? '—' : score}</span>
        <span className="pb-1 text-label text-faint">/ 100</span>
      </div>

      {components.length > 0 ? (
        <div className="flex flex-col gap-3">
          {components.map((c) => (
            <ComponentRow key={c.key} c={c} />
          ))}
        </div>
      ) : (
        <p className="text-body text-muted">Connect a wearable or log daily wellness to see your readiness.</p>
      )}

      <p className="text-label text-faint">
        Scored against your own 60-day baseline with a smallest-worthwhile-change band — never a single day.
      </p>
    </Card>
  );
}

import { Button, Card, ConfidenceDot } from '@ironflow/ui';
import type { AdaptationResult, SZone } from '@ironflow/core/physio';
import type { PlannedSession, ViewSport } from '../../lib/today-demo';

const SPORT_DOT: Record<ViewSport, string> = {
  run: 'bg-sport-run',
  bike: 'bg-sport-bike',
  swim: 'bg-sport-swim',
  strength: 'bg-sport-strength',
};
const SPORT_LABEL: Record<ViewSport, string> = { run: 'Run', bike: 'Bike', swim: 'Swim', strength: 'Strength' };

const ZONE: Record<SZone, { label: string; text: string; ring: string }> = {
  S1: { label: 'Aerobic', text: 'text-zone-z1', ring: 'border-zone-z1/40 bg-zone-z1/10' },
  S2: { label: 'Threshold', text: 'text-zone-z3', ring: 'border-zone-z3/40 bg-zone-z3/10' },
  S3: { label: 'VO₂ max', text: 'text-zone-z5', ring: 'border-zone-z5/40 bg-zone-z5/10' },
};

const hours = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
};

function ZoneBadge({ zone }: { zone: SZone }) {
  const z = ZONE[zone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-label font-medium ${z.ring} ${z.text}`}>
      {zone} · {z.label}
    </span>
  );
}

function AdaptationBanner({ adaptation, planned, effective }: { adaptation: AdaptationResult; planned: SZone; effective: SZone }) {
  if (adaptation.action === 'none' || !adaptation.mutation) return null;
  return (
    <div className="flex items-start gap-3 rounded-control border border-warn/25 bg-warn/[0.08] p-4">
      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-warn/15 text-warn">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-3.5 w-3.5">
          <path d="M10 6.5v4M10 13.5h.01M10 3 3 16h14L10 3Z" />
        </svg>
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-label font-semibold text-warn">
          Adjusted{planned !== effective ? ` — eased ${planned} to ${effective}` : ''}
        </span>
        <p className="text-body text-text/90">{adaptation.mutation.reasonText}</p>
      </div>
    </div>
  );
}

export function SessionCard({
  session,
  adaptation,
  effectiveZone,
}: {
  session: PlannedSession;
  adaptation: AdaptationResult;
  effectiveZone: SZone;
}) {
  return (
    <Card raised className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <span className="text-label uppercase tracking-widest text-faint">Today&apos;s session</span>
        <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-2.5 py-1 text-label text-muted">
          <span className={`h-2 w-2 rounded-full ${SPORT_DOT[session.sport]}`} aria-hidden />
          {SPORT_LABEL[session.sport]}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-display text-text">{session.name}</h1>
          <ZoneBadge zone={effectiveZone} />
        </div>
        <div className="flex items-start gap-2.5 text-muted">
          <span className="shrink-0 whitespace-nowrap rounded-md bg-white/[0.05] px-2 py-0.5 font-mono text-mono text-text">
            {hours(session.durationMin)}
          </span>
          <p className="text-body leading-relaxed">{session.why}</p>
        </div>
      </div>

      <AdaptationBanner adaptation={adaptation} planned={session.plannedZone} effective={effectiveZone} />

      <div className="grid gap-px overflow-hidden rounded-control border border-white/[0.06] bg-white/[0.02] sm:grid-cols-2">
        <div className="flex flex-col gap-1 p-4">
          <span className="text-label uppercase tracking-widest text-faint">Structure</span>
          <span className="text-body text-text">{session.structure}</span>
        </div>
        <div className="flex flex-col gap-1.5 p-4 sm:border-l sm:border-white/[0.06]">
          <span className="text-label uppercase tracking-widest text-faint">Targets</span>
          <span className="font-mono text-mono text-text">{session.targets}</span>
          <ConfidenceDot confidence={session.targetsConfidence} label="from your threshold estimate" />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button>Start session</Button>
        <Button variant="secondary">Move to another day</Button>
      </div>
    </Card>
  );
}

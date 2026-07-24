import { Card, ConfidenceDot } from '@ironflow/ui';
import type { AdaptationResult, SZone } from '@ironflow/core/physio';
import type { PlannedSession, ViewSport } from '../../lib/today-demo';

const SPORT_DOT: Record<ViewSport, string> = {
  run: 'bg-sport-run',
  bike: 'bg-sport-bike',
  swim: 'bg-sport-swim',
  strength: 'bg-sport-strength',
};
const SPORT_LABEL: Record<ViewSport, string> = { run: 'Run', bike: 'Bike', swim: 'Swim', strength: 'Strength' };

const hours = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ''}`.trim() : `${m}m`;
};

function AdaptationBanner({ adaptation, planned, effective }: { adaptation: AdaptationResult; planned: SZone; effective: SZone }) {
  if (adaptation.action === 'none' || !adaptation.mutation) return null;
  return (
    <div className="flex flex-col gap-1 rounded-control border border-warn/30 bg-warn/10 p-4">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-warn" aria-hidden />
        <span className="text-label font-medium text-warn">
          Adjusted{planned !== effective ? ` · ${planned} → ${effective}` : ''}
        </span>
      </div>
      <p className="text-body text-text">{adaptation.mutation.reasonText}</p>
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
    <Card className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-h2 text-text">Today&apos;s session</h2>
        <span className="inline-flex items-center gap-1.5 text-label text-muted">
          <span className={`h-2 w-2 rounded-full ${SPORT_DOT[session.sport]}`} aria-hidden />
          {SPORT_LABEL[session.sport]}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-3">
          <span className="text-h1 text-text">{session.name}</span>
          <span className="font-mono text-mono text-muted">{hours(session.durationMin)}</span>
        </div>
        <p className="text-body text-muted">{session.why}</p>
      </div>

      <AdaptationBanner adaptation={adaptation} planned={session.plannedZone} effective={effectiveZone} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-label text-faint">Structure</span>
          <span className="text-body text-text">{session.structure}</span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-label text-faint">Targets</span>
          <span className="font-mono text-mono text-text">{session.targets}</span>
          <ConfidenceDot confidence={session.targetsConfidence} label="from your threshold estimate" />
        </div>
      </div>
    </Card>
  );
}

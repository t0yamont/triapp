import { Card } from '@ironflow/ui';
import type { SZone } from '@ironflow/core/physio';
import type { UpcomingSession, ViewSport } from '../../lib/today-demo';

const SPORT_DOT: Record<ViewSport, string> = {
  run: 'bg-sport-run',
  bike: 'bg-sport-bike',
  swim: 'bg-sport-swim',
  strength: 'bg-sport-strength',
};
const ZONE_TEXT: Record<SZone, string> = { S1: 'text-zone-z1', S2: 'text-zone-z3', S3: 'text-zone-z5' };

function UpcomingCard({ s }: { s: UpcomingSession }) {
  return (
    <div
      className={`flex flex-col gap-2 rounded-control border border-white/[0.06] bg-white/[0.03] p-4 ${s.isKey ? 'border-l-[3px] border-l-warn' : ''}`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label text-muted">
          {s.dayShort}
          {s.isKey ? ' · key' : ''}
        </span>
        <span className="font-mono text-label text-faint">{s.load} load</span>
      </div>
      <span className="inline-flex items-center gap-2 text-body font-medium text-text">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SPORT_DOT[s.sport]}`} aria-hidden />
        {s.name}
      </span>
      <span className={`font-mono text-label ${ZONE_TEXT[s.zone]}`}>{s.detail}</span>
    </div>
  );
}

/** "Coming up" — the next few days at a glance, so today's call reads in its week's context. */
export function ComingUp({ sessions }: { sessions: UpcomingSession[] }) {
  if (sessions.length === 0) return null;
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-label uppercase tracking-widest text-faint">Coming up</span>
        <span className="font-mono text-label text-faint">Hard days spaced 48h apart</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {sessions.map((s) => (
          <UpcomingCard key={s.dayShort} s={s} />
        ))}
      </div>
    </Card>
  );
}

import { Card } from '@ironflow/ui';
import type { Priority, RaceView } from '../../lib/race-calendar';

const PRIORITY: Record<Priority, { label: string; chip: string }> = {
  A: { label: 'A race', chip: 'border-accent/40 bg-accent/[0.15] text-accent-bright' },
  B: { label: 'B race', chip: 'border-warn/30 bg-warn/[0.12] text-warn' },
  C: { label: 'C race', chip: 'border-white/12 bg-white/[0.05] text-muted' },
};

export function priorityChip(priority: Priority) {
  const p = PRIORITY[priority];
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-label font-medium ${p.chip}`}>{p.label}</span>;
}

export function RaceCard({ race }: { race: RaceView }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* The chip shows what the plan actually does with this race, not what was asked for. */}
          {priorityChip(race.resolved.effectivePriority)}
          {race.demoted ? (
            <span className="text-label text-faint">asked for {race.priority}</span>
          ) : null}
        </div>
        <span className="font-mono text-label tabular-nums text-faint">{race.weeksOut} wks</span>
      </div>
      <div className="flex flex-col gap-0.5">
        <h3 className="text-h2 text-text">{race.name}</h3>
        <p className="text-body text-muted">{race.eventLabel}</p>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-faint">
        <span className="text-muted">{race.dateLabel}</span>
        {race.detail ? (
          <>
            <span>·</span>
            <span>{race.detail}</span>
          </>
        ) : null}
        {race.resolved.taperDays > 0 ? (
          <>
            <span>·</span>
            <span>{race.resolved.taperDays}-day taper</span>
          </>
        ) : null}
      </div>
      <p className="text-label text-muted">{race.resolved.note}</p>
    </Card>
  );
}

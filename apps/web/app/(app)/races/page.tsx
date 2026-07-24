import { Button, Card } from '@ironflow/ui';
import { aRaceMacro, RACES } from '../../../lib/races-demo';
import { PhaseTimeline } from '../../../components/races/PhaseTimeline';
import { RaceCard, priorityChip } from '../../../components/races/RaceCard';

export default function RacesPage() {
  const aRace = RACES.find((r) => r.priority === 'A') ?? RACES[0]!;
  const others = RACES.filter((r) => r.id !== aRace.id);

  return (
    <div className="flex animate-fade-rise flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-display text-text">Races</h1>
          <p className="max-w-2xl text-body text-muted">
            Your A race drives the whole plan; B races insert a local peak, and C races are trained through.
          </p>
        </div>
        <Button variant="secondary">Add a race</Button>
      </header>

      {/* Featured A race — with the periodisation it drives */}
      <Card raised className="flex flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              {priorityChip(aRace.priority)}
              <span className="font-mono text-label tabular-nums text-faint">{aRace.weeksOut} weeks out</span>
            </div>
            <h2 className="text-h1 text-text">{aRace.name}</h2>
            <p className="text-body text-muted">{aRace.eventLabel}</p>
            <p className="text-label text-faint">
              {aRace.dateLabel} · {aRace.conditions}
            </p>
          </div>
        </div>

        <div className="hairline" />

        <div className="flex flex-col gap-4">
          <span className="text-label uppercase tracking-widest text-faint">Periodisation to race day</span>
          <PhaseTimeline weeks={aRaceMacro(aRace)} />
        </div>
      </Card>

      <div className="flex flex-col gap-4">
        <span className="text-label uppercase tracking-widest text-faint">Also on the calendar</span>
        <div className="grid gap-6 sm:grid-cols-2">
          {others.map((race) => (
            <RaceCard key={race.id} race={race} />
          ))}
        </div>
      </div>

      <p className="text-label text-faint">
        The A-race periodisation comes from <code className="font-mono text-muted">layoutMacrocycle</code> in
        <code className="font-mono text-muted"> @ironflow/core/physio</code> (§8.1) — phases, recovery cadence,
        and taper length all derive from the event and weeks available.
      </p>
    </div>
  );
}

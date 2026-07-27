'use client';

import { Card } from '@ironflow/ui';
import { useMemo, useState } from 'react';
import { AddRace } from '../../../components/races/AddRace';
import { SampleDataBadge } from '../../../components/SampleDataBadge';
import { PhaseTimeline } from '../../../components/races/PhaseTimeline';
import { RaceCard, priorityChip } from '../../../components/races/RaceCard';
import { todayISO } from '../../../lib/live-plan';
import { useLiveRaces } from '../../../lib/live-races';
import { buildRaceCalendar, primaryMacro } from '../../../lib/race-calendar';
import { DEMO_RACES } from '../../../lib/races-demo';

export default function RacesPage() {
  // The athlete's own races when there are any, else the sample athlete's — either way the
  // engine's `resolveRaceCalendar` decides what each race means for the plan.
  // Bumped after a race is added, so the list reloads without a full navigation.
  const [reloadKey, setReloadKey] = useState(0);
  const { races: live } = useLiveRaces(reloadKey);
  const today = todayISO();
  const { primary, others, warnings } = useMemo(
    () => buildRaceCalendar(live ?? DEMO_RACES, today),
    [live, today],
  );

  return (
    <div className="flex animate-fade-rise flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-display text-text">Races</h1>
          <p className="max-w-2xl text-body text-muted">
            Your A race drives the whole plan; B races insert a local peak, and C races are trained through.
          </p>
          <SampleDataBadge live={live !== null} what="races" />
        </div>
        <AddRace onAdded={() => setReloadKey((n) => n + 1)} />
      </header>

      {/* The engine flags calendars it cannot honour — e.g. two A races too close to peak for both. */}
      {warnings.map((w) => (
        <Card key={w.code} className="border-warn/30 bg-warn/[0.08]">
          <p className="text-body text-warn">{w.message}</p>
        </Card>
      ))}

      {primary ? (
        <Card raised className="flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                {priorityChip(primary.resolved.effectivePriority)}
                <span className="font-mono text-label tabular-nums text-faint">{primary.weeksOut} weeks out</span>
              </div>
              <h2 className="text-h1 text-text">{primary.name}</h2>
              <p className="text-body text-muted">{primary.eventLabel}</p>
              <p className="text-label text-faint">
                {primary.dateLabel}
                {primary.detail ? ` · ${primary.detail}` : ''} · {primary.resolved.taperDays}-day taper
                {primary.resolved.recoveryDays === undefined
                  ? ''
                  : ` · ${primary.resolved.recoveryDays}-day recovery after`}
              </p>
            </div>
          </div>

          <div className="hairline" />

          <div className="flex flex-col gap-4">
            <span className="text-label uppercase tracking-widest text-faint">Periodisation to race day</span>
            <PhaseTimeline weeks={primaryMacro(primary)} />
          </div>
        </Card>
      ) : (
        <Card raised>
          <p className="text-body text-muted">
            No A race on the calendar yet — nothing is driving your periodisation. Mark the race you most
            want to be ready for as an A race and the plan will be built backwards from it.
          </p>
        </Card>
      )}

      {others.length > 0 ? (
        <div className="flex flex-col gap-4">
          <span className="text-label uppercase tracking-widest text-faint">Also on the calendar</span>
          <div className="grid gap-6 sm:grid-cols-2">
            {others.map((race) => (
              <RaceCard key={race.id} race={race} />
            ))}
          </div>
        </div>
      ) : null}

      <p className="text-label text-faint">
        Race treatment, taper length, the post-race recovery block and any conflicts come from{' '}
        <code className="font-mono text-muted">resolveRaceCalendar</code> (§9); the A-race periodisation
        comes from <code className="font-mono text-muted">layoutMacrocycle</code> (§8.1) — both in{' '}
        <code className="font-mono text-muted">@ironflow/core/physio</code>.
      </p>
    </div>
  );
}

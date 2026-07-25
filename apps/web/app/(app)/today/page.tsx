'use client';

import { buildTodayView } from '../../../lib/today-demo';
import { useLiveWeek } from '../../../lib/live-plan';
import { useLiveReadiness } from '../../../lib/live-readiness';
import { CheckInCard } from '../../../components/today/CheckInCard';
import { VerdictHero } from '../../../components/today/VerdictHero';
import { SessionShapePanel } from '../../../components/today/SessionShapePanel';
import { SignalsPanel } from '../../../components/today/SignalsPanel';
import { WeekStrip } from '../../../components/today/WeekStrip';
import { ComingUp } from '../../../components/today/ComingUp';
import { AttentionCard } from '../../../components/today/AttentionCard';

export default function TodayPage() {
  // Every number is computed by the pure engine (@ironflow/core/physio); the week comes from
  // the athlete's persisted plan when there is one, and readiness from their own check-ins
  // once there is enough history to score — else the sample athlete.
  const view = buildTodayView();
  const { live } = useLiveWeek();
  const { live: liveReadiness, coverage, saving, error, submit } = useLiveReadiness();
  const week = live?.strip ?? view.week;
  const comingUp = live?.comingUp ?? view.comingUp;
  const readiness = liveReadiness?.readiness ?? view.readiness;

  const provenance = live
    ? liveReadiness
      ? 'Your plan · your readiness'
      : 'Your plan · readiness sample until you have enough check-ins'
    : 'Preview · sample athlete until a plan & check-ins exist';

  return (
    <div className="flex animate-fade-rise flex-col gap-6">
      <div className="flex justify-end">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-label text-muted backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(109,139,255,0.9)]" aria-hidden />
          {provenance}
        </span>
      </div>

      <VerdictHero
        session={view.session}
        adaptation={view.adaptation}
        effectiveZone={view.effectiveZone}
        readiness={readiness}
        // The narrative explains the sample adaptation, so it only holds while readiness is
        // the sample's. With a real score, the band speaks for itself rather than borrowing
        // a sentence about someone else's day.
        readinessLine={liveReadiness ? '' : view.readinessLine}
        climate={view.climate}
        dateLabel={view.dateLabel}
      />

      <CheckInCard
        coverage={coverage}
        alreadyLogged={liveReadiness?.today != null}
        saving={saving}
        error={error}
        onSubmit={submit}
      />

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr_1fr]">
        <SessionShapePanel session={view.session} />
        <SignalsPanel components={readiness.components} />
        <WeekStrip week={week} />
      </div>

      <ComingUp sessions={comingUp} />
      <AttentionCard items={view.attention} />
    </div>
  );
}

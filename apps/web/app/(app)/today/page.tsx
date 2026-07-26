'use client';

import type { AdaptationResult } from '@ironflow/core/physio';
import { buildTodayView } from '../../../lib/today-demo';
import { todayISO, useLiveWeek } from '../../../lib/live-plan';
import { useLiveReadiness } from '../../../lib/live-readiness';
import { CheckInCard } from '../../../components/today/CheckInCard';
import { VerdictHero } from '../../../components/today/VerdictHero';
import { SessionShapePanel } from '../../../components/today/SessionShapePanel';
import { SignalsPanel } from '../../../components/today/SignalsPanel';
import { WeekStrip } from '../../../components/today/WeekStrip';
import { ComingUp } from '../../../components/today/ComingUp';
import { AttentionCard } from '../../../components/today/AttentionCard';

/** No change was made — what §10.2 returns for a day it decided to leave alone. */
const UNADAPTED: AdaptationResult = {
  action: 'none',
  weekLoadDeltaPct: 0,
  suppressS3Days: 0,
  illnessPrompt: false,
};

export default function TodayPage() {
  // Every number is computed by the pure engine (@ironflow/core/physio); the week comes from
  // the athlete's persisted plan when there is one, and readiness from their own check-ins
  // once there is enough history to score — else the sample athlete.
  const view = buildTodayView();
  const { live } = useLiveWeek();
  const { live: liveReadiness, coverage, saving, error, adaptation, submit } = useLiveReadiness();
  const week = live?.strip ?? view.week;
  const comingUp = live?.comingUp ?? view.comingUp;
  const readiness = liveReadiness?.readiness ?? view.readiness;

  // Today's persisted session, so a check-in can actually adapt it (§10.2).
  const todayRow = live?.rows.find((w) => w.scheduled_date === todayISO()) ?? null;
  const todaySession =
    live && todayRow ? { workoutId: todayRow.id, planId: live.planId, sZone: todayRow.goal_zone } : undefined;

  // The athlete's own session — the row §10.2 adapts. This used to render the sample athlete's
  // session unconditionally, so the screen described a workout nobody was scheduled to do while
  // the real one was quietly rewritten underneath it.
  const session = live?.todaySession ?? view.session;
  const isLiveSession = Boolean(live?.todaySession);
  const effectiveZone = isLiveSession ? session.plannedZone : view.effectiveZone;

  // The banner and the attention list both describe *this* session, so neither may fall back to
  // the sample's once the session is real: the sample's narrative is "the engine eased today's
  // VO₂ session", which would be pinned over an athlete's easy run that nothing touched. With a
  // real session and no check-in yet, the honest state is simply "unadapted".
  const sessionAdaptation = adaptation ?? (isLiveSession ? UNADAPTED : view.adaptation);
  const attention = isLiveSession ? view.attention.filter((i) => i.kind !== 'plan_change') : view.attention;

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
        session={session}
        adaptation={sessionAdaptation}
        effectiveZone={effectiveZone}
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
        onSubmit={(checkIn) => submit(checkIn, todaySession)}
      />

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr_1fr]">
        <SessionShapePanel session={session} />
        <SignalsPanel components={readiness.components} />
        <WeekStrip week={week} />
      </div>

      <ComingUp sessions={comingUp} />
      <AttentionCard items={attention} />
    </div>
  );
}

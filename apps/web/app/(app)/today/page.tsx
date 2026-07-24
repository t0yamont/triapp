import { buildTodayView } from '../../../lib/today-demo';
import { ReadinessCard } from '../../../components/today/ReadinessCard';
import { SessionCard } from '../../../components/today/SessionCard';
import { WeekStrip } from '../../../components/today/WeekStrip';
import { AttentionCard } from '../../../components/today/AttentionCard';

export default function TodayPage() {
  // Computed by the pure engine (@ironflow/core/physio) at render — no client JS needed.
  const view = buildTodayView();

  return (
    <div className="flex animate-fade-rise flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-display text-text">Today</h1>
          <span className="text-body text-muted">{view.dateLabel}</span>
        </div>
        {view.isSample ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-label text-muted backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(109,139,255,0.9)]" aria-hidden />
            Preview · sample athlete until a plan &amp; device are connected
          </span>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        <div className="flex flex-col gap-6">
          <SessionCard session={view.session} adaptation={view.adaptation} effectiveZone={view.effectiveZone} />
          <WeekStrip week={view.week} />
        </div>
        <div className="flex flex-col gap-6">
          <ReadinessCard readiness={view.readiness} />
          <AttentionCard items={view.attention} />
        </div>
      </div>
    </div>
  );
}

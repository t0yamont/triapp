import { buildTodayView } from '../../../lib/today-demo';
import { ReadinessCard } from '../../../components/today/ReadinessCard';
import { SessionCard } from '../../../components/today/SessionCard';
import { WeekStrip } from '../../../components/today/WeekStrip';
import { AttentionCard } from '../../../components/today/AttentionCard';

export default function TodayPage() {
  // Computed by the pure engine (@ironflow/core/physio) at render — no client JS needed.
  const view = buildTodayView();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-h1 text-text">Today</h1>
          <span className="text-label text-muted">{view.dateLabel}</span>
        </div>
        {view.isSample ? (
          <span className="rounded-control border border-white/10 bg-raised px-3 py-1 text-label text-muted">
            Preview · sample athlete until a plan &amp; device are connected
          </span>
        ) : null}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
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

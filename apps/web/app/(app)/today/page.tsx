import { buildTodayView } from '../../../lib/today-demo';
import { CLIMATE_META } from '../../../lib/climate';
import { ReadinessCard } from '../../../components/today/ReadinessCard';
import { SessionCard } from '../../../components/today/SessionCard';
import { WeekStrip } from '../../../components/today/WeekStrip';
import { AttentionCard } from '../../../components/today/AttentionCard';

export default function TodayPage() {
  // Computed by the pure engine (@ironflow/core/physio) at render — no client JS needed.
  const view = buildTodayView();
  const climate = CLIMATE_META[view.climate];

  return (
    <div className="flex animate-fade-rise flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2.5">
          <h1 className="text-display text-text">Today</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-muted">
            <span className="text-body">{view.dateLabel}</span>
            <span className="text-faint">·</span>
            <span className="inline-flex items-center gap-2 text-body">
              <span data-climate-dot className="h-2 w-2 rounded-full" style={{ background: climate.dot, boxShadow: `0 0 9px ${climate.dot}` }} aria-hidden />
              <span data-climate-label className="font-medium text-text">{climate.label}</span>
              <span data-climate-hint className="text-faint">— {climate.hint}</span>
            </span>
          </div>
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

import { buildTodayView } from '../../../lib/today-demo';
import { VerdictHero } from '../../../components/today/VerdictHero';
import { SessionShapePanel } from '../../../components/today/SessionShapePanel';
import { SignalsPanel } from '../../../components/today/SignalsPanel';
import { WeekStrip } from '../../../components/today/WeekStrip';
import { ComingUp } from '../../../components/today/ComingUp';
import { AttentionCard } from '../../../components/today/AttentionCard';

export default function TodayPage() {
  // Computed by the pure engine (@ironflow/core/physio) at render — no client JS needed.
  const view = buildTodayView();

  return (
    <div className="flex animate-fade-rise flex-col gap-6">
      {view.isSample ? (
        <div className="flex justify-end">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-label text-muted backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(109,139,255,0.9)]" aria-hidden />
            Preview · sample athlete until a plan &amp; device are connected
          </span>
        </div>
      ) : null}

      <VerdictHero
        session={view.session}
        adaptation={view.adaptation}
        effectiveZone={view.effectiveZone}
        readiness={view.readiness}
        readinessLine={view.readinessLine}
        climate={view.climate}
        dateLabel={view.dateLabel}
      />

      <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr_1fr]">
        <SessionShapePanel session={view.session} />
        <SignalsPanel components={view.readiness.components} />
        <WeekStrip week={view.week} />
      </div>

      <ComingUp sessions={view.comingUp} />
      <AttentionCard items={view.attention} />
    </div>
  );
}

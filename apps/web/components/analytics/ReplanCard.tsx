import { Card } from '@ironflow/ui';
import type { ReplanAction, ReplanDecision } from '@ironflow/core/physio';

const TITLE: Record<ReplanAction, string> = {
  reduce_weekly_target: 'Target trimmed',
  permit_full_ramp: 'Full ramp permitted',
  schedule_fitness_test: 'Test scheduled',
  recompute_wkg: 'W/kg recomputed',
  shift_to_aerobic: 'Shifted to aerobic',
  adjust_distribution: 'Mix adjusted',
};
const TONE: Record<ReplanAction, string> = {
  reduce_weekly_target: 'border-l-warn',
  permit_full_ramp: 'border-l-ok',
  schedule_fitness_test: 'border-l-accent',
  recompute_wkg: 'border-l-accent',
  shift_to_aerobic: 'border-l-warn',
  adjust_distribution: 'border-l-accent',
};

/**
 * "What the weekly re-plan changed" — the §10.3 triggers evaluated at this week's boundary
 * (`weeklyReplan`), the slow evidence-based sibling of the daily readiness response. Governing
 * principle: adjust the plan, not the athlete. An empty list means the plan is on track — that
 * absence is itself the signal, so the card doesn't render rather than claiming a false "all good".
 */
export function ReplanCard({ decisions }: { decisions: ReplanDecision[] }) {
  if (decisions.length === 0) return null;
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label uppercase tracking-widest text-faint">What the weekly re-plan changed</span>
        <span className="text-label text-faint">evaluated at the week boundary · §10.3</span>
      </div>
      <div className="flex flex-col gap-3">
        {decisions.map((d, i) => (
          <div key={i} className={`flex flex-col gap-1 border-l-2 pl-3.5 ${TONE[d.action]}`}>
            <span className="text-label font-medium text-text">{TITLE[d.action]}</span>
            <span className="text-body text-muted">{d.reasonText}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

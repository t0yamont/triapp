'use client';

/**
 * DecisionLog — "why did my Thursday change" (02-ARCHITECTURE.md §8).
 *
 * §8 calls this table "the product's credibility", and it is: an adaptive plan that changes
 * without saying why is indistinguishable from one that is broken. Every entry shows the sentence
 * the engine wrote at the time, plus the rule that fired — so an athlete who wants the mechanism
 * can see it, and one who just wants reassurance does not have to.
 *
 * Renders nothing until something has actually changed. A permanently empty "Recent changes"
 * panel is noise on the one screen that has to stay readable at 6am.
 */

import { Card } from '@ironflow/ui';
import type { DecisionDay, PlanActor } from '@ironflow/api-client';
import { useLiveDecisions } from '../../lib/live-decisions';

/** Who made the change. The engine is the interesting case; the rest are for completeness. */
const ACTOR_LABEL: Record<PlanActor, string> = {
  engine: 'Engine',
  athlete: 'You',
  coach: 'Coach',
  system: 'System',
};

const ACTOR_EDGE: Record<PlanActor, string> = {
  engine: 'border-l-accent',
  athlete: 'border-l-ok',
  coach: 'border-l-warn',
  system: 'border-l-white/20',
};

function dayLabel(date: string, today: string): string {
  if (date === today) return 'Today';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function DecisionLog({ days, today }: { days: DecisionDay[]; today: string }) {
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-widest text-faint">Why your plan changed</span>
        <span className="text-body text-muted">Every adaptation, with what the engine saw when it decided.</span>
      </div>

      <div className="flex flex-col gap-5">
        {days.map((day) => (
          <div key={day.date} className="flex flex-col gap-2.5">
            <span className="text-label text-faint">{dayLabel(day.date, today)}</span>
            {day.decisions.map((decision) => (
              <div key={decision.id} className={`flex flex-col gap-1 border-l-2 pl-3.5 ${ACTOR_EDGE[decision.actor]}`}>
                <span className="text-body text-text">{decision.reasonText}</span>
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-faint">
                  <span>{ACTOR_LABEL[decision.actor]}</span>
                  <span aria-hidden>·</span>
                  {/* The stable identifier. Copy can be rewritten; this is what support quotes. */}
                  <code className="font-mono text-faint">{decision.reasonCode}</code>
                  {decision.ruleId && (
                    <>
                      <span aria-hidden>·</span>
                      <span>rule {decision.ruleId}</span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** Self-loading variant for pages that just want the panel. Renders nothing when there is none. */
export function LiveDecisionLog({ today }: { today: string }) {
  const { days } = useLiveDecisions();
  if (!days || days.length === 0) return null;
  return <DecisionLog days={days} today={today} />;
}

'use client';

import { Button, Card } from '@ironflow/ui';
import type { MacroWeek, PlanSummary } from '@ironflow/core/physio';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PhaseTimeline } from '../races/PhaseTimeline';

const STAGES = ['Building your athlete model', 'Laying out training phases', 'Placing key sessions', 'Checking safety limits'];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-control border border-white/[0.06] bg-white/[0.02] p-4">
      <span className="text-h1 tabular-nums text-text">{value}</span>
      <span className="text-label uppercase tracking-widest text-faint">{label}</span>
    </div>
  );
}

export function PlanGeneration({ summary, weeks }: { summary: PlanSummary; weeks: MacroWeek[] }) {
  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (step < STAGES.length) {
      const t = setTimeout(() => setStep(step + 1), 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRevealed(true), 550);
    return () => clearTimeout(t);
  }, [step]);

  if (!revealed) {
    return (
      <Card raised className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-h1 text-text">Building your plan</h1>
          <p className="text-body text-muted">Anchored to your thresholds and your availability — under the safety guardrails.</p>
        </div>
        <ul className="flex flex-col gap-3">
          {STAGES.map((label, i) => {
            const state = i < step ? 'done' : i === step ? 'active' : 'pending';
            return (
              <li key={label} className="flex items-center gap-3">
                <span
                  className={
                    state === 'done'
                      ? 'grid h-6 w-6 place-items-center rounded-full bg-ok/15 text-ok'
                      : state === 'active'
                        ? 'grid h-6 w-6 place-items-center rounded-full bg-accent/15 text-accent-bright'
                        : 'grid h-6 w-6 place-items-center rounded-full bg-white/[0.05] text-faint'
                  }
                >
                  {state === 'done' ? (
                    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M5 10.5l3.5 3.5L15 6.5" />
                    </svg>
                  ) : state === 'active' ? (
                    <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-faint" />
                  )}
                </span>
                <span className={state === 'pending' ? 'text-body text-faint' : 'text-body text-text'}>{label}</span>
              </li>
            );
          })}
        </ul>
      </Card>
    );
  }

  return (
    <div className="flex animate-fade-rise flex-col gap-6">
      <Card raised className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <div className="inline-flex w-fit items-center gap-2 rounded-full bg-ok/15 px-2.5 py-1 text-label font-medium text-ok">
            <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden /> Plan ready
          </div>
          <h1 className="text-display text-text">Your {summary.totalWeeks}-week plan is built</h1>
          <p className="text-body text-muted">A complete, guardrail-valid periodisation to race day — every week has a purpose.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Weeks" value={String(summary.totalWeeks)} />
          <Stat label="Sessions" value={String(summary.totalWorkouts)} />
          <Stat label="Hours" value={`${summary.totalHours}`} />
          <Stat label="Recovery wks" value={String(summary.recoveryWeeks)} />
        </div>

        <div className="flex flex-col gap-3">
          <span className="text-label uppercase tracking-widest text-faint">Periodisation to race day</span>
          <PhaseTimeline weeks={weeks} />
        </div>
      </Card>

      <Card className="flex flex-col gap-3">
        <span className="text-label uppercase tracking-widest text-faint">Before you start</span>
        <ul className="flex flex-col gap-2 text-body">
          <li className="flex gap-2.5">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ok" aria-hidden />
            <span className="text-muted"><span className="text-text">What we know:</span> your thresholds and the days you can train.</span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
            <span className="text-muted"><span className="text-text">What we don't yet:</span> your fatigue resistance on long days — we'll learn it as you ride.</span>
          </li>
          <li className="flex gap-2.5">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            <span className="text-muted"><span className="text-text">First test:</span> a threshold test in ~2 weeks to confirm your zones.</span>
          </li>
        </ul>
      </Card>

      <div className="flex justify-end">
        <Link href="/today">
          <Button>Go to today</Button>
        </Link>
      </div>
    </div>
  );
}

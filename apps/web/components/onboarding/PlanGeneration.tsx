'use client';

import { generatePlan, type GeneratePlanInput } from '@ironflow/core/physio';
import { insertGeneratedPlan, type GeneratedPlanMeta, type Json } from '@ironflow/api-client';
import { Button, Card } from '@ironflow/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useSupabase } from '../../lib/supabase';
import { PhaseTimeline } from '../races/PhaseTimeline';

const STAGES = ['Building your athlete model', 'Laying out training phases', 'Placing key sessions', 'Checking safety limits'];
const ENGINE_VERSION = 'physio-1';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-control border border-white/[0.06] bg-white/[0.02] p-4">
      <span className="text-h1 tabular-nums text-text">{value}</span>
      <span className="text-label uppercase tracking-widest text-faint">{label}</span>
    </div>
  );
}

export function PlanGeneration({ input }: { input: GeneratePlanInput }) {
  const router = useRouter();
  const supabase = useSupabase();
  const plan = useMemo(() => generatePlan(input), [input]);
  const weeks = useMemo(() => plan.weeks.map((w) => ({ weekNumber: w.weekNumber, phase: w.phase, isRecoveryWeek: w.isRecoveryWeek })), [plan]);

  const [step, setStep] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [athleteId, setAthleteId] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Who are we saving for? (null until known; stays null with no Supabase / not signed in.)
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setAthleteId(data.user?.id ?? null);
    });
    return () => {
      alive = false;
    };
  }, [supabase]);

  useEffect(() => {
    if (step < STAGES.length) {
      const t = setTimeout(() => setStep(step + 1), 700);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setRevealed(true), 550);
    return () => clearTimeout(t);
  }, [step]);

  const canSave = Boolean(supabase && athleteId);

  async function handleSave() {
    if (!supabase || !athleteId) {
      router.push('/today');
      return;
    }
    setSave('saving');
    setErrorMsg(null);
    const meta: GeneratedPlanMeta = {
      name: 'Your training plan',
      modelSnapshot: { confidence: input.confidence, trainingAgeYears: input.trainingAgeYears } as unknown as Json,
      availabilitySnapshot: input.availability as unknown as Json,
      distributionPolicy: { source: 'engine §4.2 per phase' } as unknown as Json,
      engineVersion: ENGINE_VERSION,
      course: input.course,
    };
    try {
      await insertGeneratedPlan(supabase, athleteId, plan, meta);
      router.push('/today');
    } catch (e) {
      setSave('error');
      setErrorMsg(e instanceof Error ? e.message : 'Could not save your plan.');
    }
  }

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
          <h1 className="text-display text-text">Your {plan.summary.totalWeeks}-week plan is built</h1>
          <p className="text-body text-muted">A complete, guardrail-valid periodisation to race day — every week has a purpose.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Weeks" value={String(plan.summary.totalWeeks)} />
          <Stat label="Sessions" value={String(plan.summary.totalWorkouts)} />
          <Stat label="Hours" value={`${plan.summary.totalHours}`} />
          <Stat label="Recovery wks" value={String(plan.summary.recoveryWeeks)} />
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

      <div className="flex flex-col items-end gap-2">
        {save === 'error' ? (
          <div className="w-full rounded-control border border-risk/30 bg-risk/[0.08] p-3 text-label text-risk">
            Couldn&apos;t save your plan: {errorMsg}. You can still continue.
          </div>
        ) : null}
        <div className="flex items-center gap-3">
          <span className="text-label text-faint">
            {canSave ? 'Saves the plan to your account' : 'Connect Supabase & sign in to save this plan'}
          </span>
          {save === 'error' ? (
            <Button variant="secondary" onClick={() => router.push('/today')}>
              Continue anyway
            </Button>
          ) : null}
          <Button onClick={handleSave} disabled={save === 'saving'}>
            {save === 'saving' ? 'Saving…' : canSave ? 'Save plan & continue' : 'Go to today'}
          </Button>
        </div>
      </div>
    </div>
  );
}

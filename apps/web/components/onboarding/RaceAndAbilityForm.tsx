'use client';

import {
  assessGoalFeasibility,
  assessPlanWindow,
  assessStartReadiness,
  baselineLongestBySport,
  baselineWeeklyLoad,
  predictRaceTime,
  weeksToRace,
  type BaselineAbility,
  type EventType,
  type GeneratePlanInput,
} from '@ironflow/core/physio';
import { Button, Card, ConfidenceDot, Field, Input, Select } from '@ironflow/ui';
import { useMemo, useState } from 'react';
import { EVENT_META, EVENT_TYPES } from '../../lib/eventMeta';
import { NotConnectedBanner } from '../NotConnectedBanner';
import { supabaseConfigured, useSupabase } from '../../lib/supabase';

// A brand-new athlete has no measured anchors yet — RAMP_CAP_LOW_CONFIDENCE territory (§2.4),
// not a guess at their actual fitness. Raised once real thresholds are measured (I14: only up).
const NEW_ATHLETE_CONFIDENCE = 0.3;
const DEFAULT_WEEKLY_HOURS_MAX = 10;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hmsToSeconds(h: string, m: string, s: string): number | undefined {
  const H = Number(h) || 0;
  const M = Number(m) || 0;
  const S = Number(s) || 0;
  const total = H * 3600 + M * 60 + S;
  return total > 0 ? total : undefined;
}

export interface RaceAndAbilityResult {
  input: GeneratePlanInput;
  baseline: BaselineAbility;
  race: {
    name: string;
    raceDate: string;
    eventType: EventType;
    priority: 'A' | 'B' | 'C';
    goalTimeS?: number;
  };
  trainingAgeYears: number;
}

/**
 * Step 7 of 8 — "your numbers", the practical version for an athlete with no device history
 * to pre-fill from (spec/06-UX.md §onboarding [7]/[8]): what you can currently do, and the
 * race you're building toward. Every verdict shown is computed live by the same pure engine
 * that will build the plan — never a separate guess (docs/algorithm-review-2026-07.md §2.1-2.3).
 */
export function RaceAndAbilityForm({ onReady }: { onReady: (result: RaceAndAbilityResult) => void }) {
  const supabase = useSupabase();
  const [raceName, setRaceName] = useState('');
  const [raceDate, setRaceDate] = useState('');
  const [eventType, setEventType] = useState<EventType>('70.3');
  const [priority, setPriority] = useState<'A' | 'B' | 'C'>('A');
  const [goalH, setGoalH] = useState('');
  const [goalM, setGoalM] = useState('');
  const [goalS, setGoalS] = useState('');

  const [recentDistanceM, setRecentDistanceM] = useState('');
  const [recentH, setRecentH] = useState('');
  const [recentM, setRecentM] = useState('');
  const [recentS, setRecentS] = useState('');

  const [longestRunMin, setLongestRunMin] = useState('');
  const [longestRideMin, setLongestRideMin] = useState('');
  const [longestSwimM, setLongestSwimM] = useState('');
  const [sessionsPerWeek, setSessionsPerWeek] = useState('4');
  const [typicalWeeklyHours, setTypicalWeeklyHours] = useState('6');
  const [trainingAgeYears, setTrainingAgeYears] = useState('1');

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const baseline: BaselineAbility = useMemo(
    () => ({
      longestRunMin: longestRunMin ? Number(longestRunMin) : undefined,
      longestRideMin: longestRideMin ? Number(longestRideMin) : undefined,
      longestSwimM: longestSwimM ? Number(longestSwimM) : undefined,
      sessionsPerWeek: Number(sessionsPerWeek) || 0,
      typicalWeeklyHours: Number(typicalWeeklyHours) || 0,
    }),
    [longestRunMin, longestRideMin, longestSwimM, sessionsPerWeek, typicalWeeklyHours],
  );

  // Every verdict below is the same reasonText the engine will show on the plan itself —
  // the form and the plan never disagree, because they call the same functions.
  const window = useMemo(() => {
    if (!raceDate) return null;
    const weeks = weeksToRace(todayISO(), raceDate);
    return { weeks, verdict: assessPlanWindow(eventType, weeks) };
  }, [raceDate, eventType]);

  const readiness = useMemo(() => assessStartReadiness(eventType, baseline), [eventType, baseline]);

  const goalTimeS = hmsToSeconds(goalH, goalM, goalS);
  const recentTimeS = hmsToSeconds(recentH, recentM, recentS);
  const recentM_ = Number(recentDistanceM) || 0;

  const feasibility = useMemo(() => {
    if (!EVENT_META[eventType].isRun || !goalTimeS || !recentTimeS || recentM_ <= 0) return null;
    const predicted = predictRaceTime(recentM_, recentTimeS, distanceMForEvent(eventType), Number(typicalWeeklyHours) || 4);
    return { predicted, verdict: assessGoalFeasibility(predicted, goalTimeS) };
  }, [eventType, goalTimeS, recentTimeS, recentM_, typicalWeeklyHours]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!raceName.trim()) return setError('Give your race a name.');
    if (!raceDate) return setError('When is it?');
    if (raceDate <= todayISO()) return setError('Race day needs to be in the future.');
    if (!window || window.verdict.adequacy === 'too_short') {
      return setError(window ? window.verdict.reasonText : 'Pick a race date first.');
    }

    setBusy(true);

    const startingLoad = baselineWeeklyLoad(baseline);
    const priorLongest = baselineLongestBySport(baseline);
    void priorLongest; // seeds week 1's G2 check server-side once workouts persist; not needed to build the first plan

    let availability: GeneratePlanInput['availability'] = {
      dayMinutes: { 1: 45, 2: 45, 3: 45, 4: 45, 6: 90 },
      weeklyHoursMax: Math.max(DEFAULT_WEEKLY_HOURS_MAX, Number(typicalWeeklyHours) || 0),
    };

    if (supabase) {
      const { data: auth } = await supabase.auth.getUser();
      const athleteId = auth.user?.id;
      if (athleteId) {
        const { data: avail } = await supabase.from('athlete_availability').select('*').eq('athlete_id', athleteId).maybeSingle();
        if (avail) {
          const dayMinutes: Record<number, number> = {};
          for (const [day, min] of Object.entries((avail.day_minutes as Record<string, number>) ?? {})) {
            dayMinutes[Number(day)] = min;
          }
          availability = {
            dayMinutes,
            weeklyHoursMax: avail.weekly_hours_max,
            ...(avail.long_ride_day !== null ? { longRideDay: avail.long_ride_day } : {}),
            ...(avail.long_run_day !== null ? { longRunDay: avail.long_run_day } : {}),
            swimDays: avail.swim_days ?? [],
          };
        }

        await supabase.from('profiles').update({ training_age_years: Number(trainingAgeYears) || 0 }).eq('id', athleteId);
        const { error: raceErr } = await supabase.from('races').insert({
          athlete_id: athleteId,
          name: raceName.trim(),
          race_date: raceDate,
          priority,
          event_type: eventType,
          goal_time_s: goalTimeS ?? null,
        });
        if (raceErr) {
          setBusy(false);
          return setError(raceErr.message);
        }
      }
    }

    const input: GeneratePlanInput = {
      totalWeeks: window.weeks,
      eventType,
      course: EVENT_META[eventType].course,
      availability,
      startingLoad,
      confidence: NEW_ATHLETE_CONFIDENCE,
      trainingAgeYears: Number(trainingAgeYears) || 0,
      startDate: todayISO(),
    };

    setBusy(false);
    onReady({
      input,
      baseline,
      race: { name: raceName.trim(), raceDate, eventType, priority, ...(goalTimeS !== undefined ? { goalTimeS } : {}) },
      trainingAgeYears: Number(trainingAgeYears) || 0,
    });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 px-5 py-12">
      <header className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-widest text-faint">Step 7 of 8</span>
        <h1 className="text-h1 text-text">Your race, and where you're starting from</h1>
        <p className="text-body text-muted">
          No device history yet, so this is how the plan learns your starting point. Every check below is the
          engine's own verdict — it's exactly what you'll see on the plan itself.
        </p>
      </header>

      <Card raised>
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {!supabaseConfigured() && <NotConnectedBanner />}

          <div className="flex flex-col gap-4">
            <span className="text-label uppercase tracking-widest text-faint">Your race</span>
            <Field label="Race name" htmlFor="raceName">
              <Input id="raceName" value={raceName} onChange={(e) => setRaceName(e.target.value)} placeholder="Weymouth 70.3" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Race date" htmlFor="raceDate">
                <Input id="raceDate" type="date" min={todayISO()} value={raceDate} onChange={(e) => setRaceDate(e.target.value)} />
              </Field>
              <Field label="Distance" htmlFor="eventType">
                <Select id="eventType" value={eventType} onChange={(e) => setEventType(e.target.value as EventType)}>
                  {EVENT_TYPES.map((et) => (
                    <option key={et} value={et}>
                      {EVENT_META[et].label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Priority" htmlFor="priority" hint="A drives the whole plan; B gets a local taper; C is trained through.">
              <Select id="priority" value={priority} onChange={(e) => setPriority(e.target.value as 'A' | 'B' | 'C')}>
                <option value="A">A — the race the plan is built around</option>
                <option value="B">B — a tune-up race</option>
                <option value="C">C — trained through, no taper</option>
              </Select>
            </Field>

            {window ? <PlanWindowVerdict verdict={window.verdict} /> : null}
          </div>

          <div className="hairline" />

          <div className="flex flex-col gap-4">
            <span className="text-label uppercase tracking-widest text-faint">Goal time (optional)</span>
            <HMSField label="Goal finish time" h={goalH} m={goalM} s={goalS} setH={setGoalH} setM={setGoalM} setS={setGoalS} />

            {EVENT_META[eventType].isRun ? (
              <>
                <Field label="Recent race distance (m)" htmlFor="recentDist" hint="A recent race or hard time trial — used only to check your goal, never saved.">
                  <Input id="recentDist" type="number" min={0} placeholder="10000 for a 10K" value={recentDistanceM} onChange={(e) => setRecentDistanceM(e.target.value)} />
                </Field>
                <HMSField label="Time for that distance" h={recentH} m={recentM} s={recentS} setH={setRecentH} setM={setRecentM} setS={setRecentS} />
                {feasibility ? <GoalFeasibilityVerdict feasibility={feasibility} /> : null}
              </>
            ) : (
              <p className="text-label text-faint">
                We don&apos;t predict multi-sport goal times yet — this is saved for pacing reference only.
              </p>
            )}
          </div>

          <div className="hairline" />

          <div className="flex flex-col gap-4">
            <span className="text-label uppercase tracking-widest text-faint">What you can currently do</span>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Longest run" htmlFor="run" hint="minutes, comfortably">
                <Input id="run" type="number" min={0} value={longestRunMin} onChange={(e) => setLongestRunMin(e.target.value)} />
              </Field>
              <Field label="Longest ride" htmlFor="ride" hint="minutes, comfortably">
                <Input id="ride" type="number" min={0} value={longestRideMin} onChange={(e) => setLongestRideMin(e.target.value)} />
              </Field>
              <Field label="Longest swim" htmlFor="swim" hint="metres, comfortably">
                <Input id="swim" type="number" min={0} value={longestSwimM} onChange={(e) => setLongestSwimM(e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Sessions / week now" htmlFor="sessions">
                <Input id="sessions" type="number" min={0} value={sessionsPerWeek} onChange={(e) => setSessionsPerWeek(e.target.value)} />
              </Field>
              <Field label="Weekly hours now" htmlFor="hours">
                <Input id="hours" type="number" min={0} step={0.5} value={typicalWeeklyHours} onChange={(e) => setTypicalWeeklyHours(e.target.value)} />
              </Field>
              <Field label="Years training" htmlFor="age">
                <Input id="age" type="number" min={0} step={0.5} value={trainingAgeYears} onChange={(e) => setTrainingAgeYears(e.target.value)} />
              </Field>
            </div>

            <StartReadinessVerdict readiness={readiness} />
          </div>

          {error ? <p className="text-label text-risk">{error}</p> : null}

          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Build my plan'}
          </Button>
        </form>
      </Card>
    </main>
  );
}

function distanceMForEvent(eventType: EventType): number {
  switch (eventType) {
    case '5k':
      return 5000;
    case '10k':
      return 10000;
    case 'half_marathon':
      return 21097.5;
    case 'marathon':
      return 42195;
    default:
      return 10000; // triathlon run legs are gated off this path (EVENT_META.isRun), unreachable in practice
  }
}

function HMSField({
  label,
  h,
  m,
  s,
  setH,
  setM,
  setS,
}: {
  label: string;
  h: string;
  m: string;
  s: string;
  setH: (v: string) => void;
  setM: (v: string) => void;
  setS: (v: string) => void;
}) {
  return (
    <Field label={label} htmlFor={`${label}-h`}>
      <div className="grid grid-cols-3 gap-2">
        <Input id={`${label}-h`} type="number" min={0} placeholder="h" value={h} onChange={(e) => setH(e.target.value)} />
        <Input type="number" min={0} max={59} placeholder="m" value={m} onChange={(e) => setM(e.target.value)} />
        <Input type="number" min={0} max={59} placeholder="s" value={s} onChange={(e) => setS(e.target.value)} />
      </div>
    </Field>
  );
}

const WINDOW_TONE: Record<string, string> = {
  recommended: 'border-ok/25 bg-ok/[0.08] text-ok',
  compressed: 'border-warn/25 bg-warn/[0.08] text-warn',
  too_short: 'border-risk/25 bg-risk/[0.08] text-risk',
};

function PlanWindowVerdict({ verdict }: { verdict: ReturnType<typeof assessPlanWindow> }) {
  return (
    <div className={`rounded-control border p-3.5 text-body ${WINDOW_TONE[verdict.adequacy]}`}>
      <span className="font-medium">{verdict.totalWeeks} weeks to train.</span> {verdict.reasonText}
    </div>
  );
}

function StartReadinessVerdict({ readiness }: { readiness: ReturnType<typeof assessStartReadiness> }) {
  return (
    <div className={`rounded-control border p-3.5 text-body ${readiness.ready ? 'border-ok/25 bg-ok/[0.08] text-ok' : 'border-warn/25 bg-warn/[0.08] text-warn'}`}>
      {readiness.reasonText}
    </div>
  );
}

function GoalFeasibilityVerdict({ feasibility }: { feasibility: { predicted: ReturnType<typeof predictRaceTime>; verdict: ReturnType<typeof assessGoalFeasibility> } }) {
  const { predicted, verdict } = feasibility;
  return (
    <div className={`flex flex-col gap-2 rounded-control border p-3.5 ${verdict.feasible ? 'border-ok/25 bg-ok/[0.08]' : 'border-warn/25 bg-warn/[0.08]'}`}>
      <p className={`text-body ${verdict.feasible ? 'text-ok' : 'text-warn'}`}>{verdict.reasonText}</p>
      <ConfidenceDot confidence={predicted.confidence} label="predicted from that one result via Riegel" />
    </div>
  );
}

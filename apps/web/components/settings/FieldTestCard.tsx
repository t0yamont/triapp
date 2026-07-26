'use client';

/**
 * Record a swim CSS time trial — the first place a field test *result* can be entered at all.
 *
 * §12 opens with "tests are prescriptions, not suggestions", and `nextFieldTest` has been telling
 * athletes when to test for months. Nothing recorded what the test measured, so no athlete ever
 * acquired a threshold anchor and `external_load` stayed null for everyone.
 *
 * Deliberately swim-only for now. CSS is the one anchor that **needs** a person to type something
 * in: §6.3 fits critical power and critical speed *passively* from mean-max efforts in ordinary
 * training, so a bike or run test screen would be asking for data the engine should be deriving
 * on its own. See `D-FIELD-TEST-CAPTURE`.
 */

import { CSS_LONG_M, CSS_SHORT_M, type CssRejection } from '@ironflow/core/physio';
import { recordCssTest, type FieldTestOutcome } from '@ironflow/api-client';
import { Button, Card, ConfidenceDot, Field, Input } from '@ironflow/ui';
import { useState } from 'react';
import { supabaseConfigured, useSupabase } from '../../lib/supabase';

/** Why a fit was refused, in the athlete's terms. A refusal is information, not an error. */
const REJECTION_COPY: Record<CssRejection, string> = {
  wrong_distances: `Those need to be a ${CSS_SHORT_M} m and a ${CSS_LONG_M} m trial.`,
  non_increasing: `The ${CSS_LONG_M} m has to take longer than the ${CSS_SHORT_M} m — check the times aren't swapped.`,
  pacing_inconsistent: `Your ${CSS_SHORT_M} m was sprinted relative to the ${CSS_LONG_M} m, so the pair doesn't describe a speed you could hold. Swim both as hard-but-even efforts and try again.`,
};

/** "1:32" or "92" → seconds. Swimmers read mm:ss; making them convert would invite errors. */
export function parseTime(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length > 2) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const seconds = parts.length === 2 ? nums[0]! * 60 + nums[1]! : nums[0]!;
  return seconds > 0 ? seconds : null;
}

/** Seconds → "1:32" per 100 m, the unit a swim set is actually written in. */
export function paceLabel(secondsPer100m: number): string {
  const whole = Math.round(secondsPer100m);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function FieldTestCard() {
  const supabase = useSupabase();
  const [shortTime, setShortTime] = useState('');
  const [longTime, setLongTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<FieldTestOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const shortS = parseTime(shortTime);
  const longS = parseTime(longTime);
  const ready = shortS !== null && longS !== null && supabaseConfigured();

  async function submit(): Promise<void> {
    if (!supabase || shortS === null || longS === null) return;
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Sign in to record a test.');
      setOutcome(
        await recordCssTest(
          supabase,
          auth.user.id,
          { shortTimeS: shortS, longTimeS: longS },
          new Date().toISOString(),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save your test.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-widest text-faint">Swim field test · CSS</span>
        <span className="text-body text-muted">
          Swim {CSS_SHORT_M} m and {CSS_LONG_M} m as hard, even efforts in one session, about five minutes
          easy between them. Your critical swim speed is the difference between the two — it sets every
          swim pace target and lets your swims be scored for load.
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`${CSS_SHORT_M} m time`} htmlFor="css-short" hint="mm:ss or seconds">
          <Input id="css-short" inputMode="numeric" placeholder="3:05" value={shortTime} onChange={(e) => setShortTime(e.target.value)} />
        </Field>
        <Field label={`${CSS_LONG_M} m time`} htmlFor="css-long" hint="mm:ss or seconds">
          <Input id="css-long" inputMode="numeric" placeholder="6:40" value={longTime} onChange={(e) => setLongTime(e.target.value)} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void submit()} disabled={!ready || busy}>
          {busy ? 'Fitting…' : 'Record test'}
        </Button>
        {!supabaseConfigured() ? (
          <span className="text-label text-faint">Connect your account to record a test.</span>
        ) : null}
      </div>

      {outcome?.status === 'recorded' ? (
        <div className="flex flex-col gap-2 rounded-control border border-ok/25 bg-ok/[0.06] p-4">
          <span className="text-body text-text">
            Critical swim speed <span className="font-mono tabular-nums">{paceLabel(outcome.pacePer100m)}</span> per 100 m
          </span>
          <span className="text-label text-muted">
            Your swim zones and targets now come from this. Swims recorded from here on can be scored for load.
          </span>
          <ConfidenceDot
            confidence={outcome.anchor.confidence}
            label="From your own time trial — CSS tracks threshold speed closely but isn't identical to it"
          />
        </div>
      ) : null}

      {outcome?.status === 'rejected' ? (
        <p className="rounded-control border border-warn/25 bg-warn/[0.06] p-4 text-body text-text">
          {REJECTION_COPY[outcome.reason]}
        </p>
      ) : null}

      {outcome?.status === 'blocked' ? <p className="text-body text-risk">{outcome.reason}</p> : null}
      {error ? <p className="text-body text-risk">{error}</p> : null}
    </Card>
  );
}

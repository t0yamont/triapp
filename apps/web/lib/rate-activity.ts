'use client';

/**
 * lib/rate-activity.ts — record how hard a session felt (§5.1 sRPE).
 *
 * sRPE is the only one of the three load models that needs no sensor and no threshold, and it
 * was the only one with **no capture path at all** — `activities.rpe` and `perceived_load` were
 * null on every row, so the §5.1 cross-check between metrics had nothing to compare and the
 * athlete's own judgement never entered the model.
 *
 * One hook for the whole list rather than one per row: `useSupabase()` memoises per *component*,
 * so a hook inside each row would build a browser client (and its auth listener) per activity.
 */

import { setActivityRpe } from '@ironflow/api-client';
import { useCallback, useState } from 'react';
import { useSupabase } from './supabase';

/**
 * The CR10 (Borg category-ratio) scale as session-RPE uses it (Foster et al. 2001).
 *
 * Only the anchored values carry a word — that is how CR10 is defined, and inventing labels for
 * the gaps would change what the athlete is being asked. 0 ("rest") is deliberately absent: this
 * rates a session that happened.
 */
export const RPE_SCALE: readonly { value: number; anchor?: string }[] = [
  { value: 1, anchor: 'Very very easy' },
  { value: 2, anchor: 'Easy' },
  { value: 3, anchor: 'Moderate' },
  { value: 4, anchor: 'Somewhat hard' },
  { value: 5, anchor: 'Hard' },
  { value: 6 },
  { value: 7, anchor: 'Very hard' },
  { value: 8 },
  { value: 9 },
  { value: 10, anchor: 'Maximal' },
];

export interface UseActivityRatings {
  /** The sRPE just written for this activity, so the row updates without a re-read. */
  srpeOf: (activityId: string) => number | null;
  /** Which activity is mid-write, if any. */
  savingId: string | null;
  error: string | null;
  rate: (activityId: string, rpe: number) => Promise<void>;
}

export function useActivityRatings(): UseActivityRatings {
  const supabase = useSupabase();
  const [rated, setRated] = useState<Record<string, number>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rate = useCallback(
    async (activityId: string, rpe: number): Promise<void> => {
      if (!supabase) return setError('Not connected to your account.');
      setSavingId(activityId);
      setError(null);
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) throw new Error('Sign in to rate a session.');
        const srpe = await setActivityRpe(supabase, auth.user.id, activityId, rpe);
        setRated((prev) => ({ ...prev, [activityId]: srpe }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save your rating.');
      } finally {
        setSavingId(null);
      }
    },
    [supabase],
  );

  return {
    srpeOf: useCallback((activityId: string) => rated[activityId] ?? null, [rated]),
    savingId,
    error,
    rate,
  };
}

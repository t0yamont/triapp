'use client';

/**
 * lib/post-auth.ts — where a signed-in athlete belongs.
 *
 * The bug this exists to prevent: **every** authenticated path used to land on
 * `/onboarding/about`, so a returning athlete re-entered their date of birth, re-picked a race,
 * and generated a *second* plan — every single sign-in. `getActivePlan` orders by `created_at`
 * and takes the newest, so the duplicate silently shadowed the original rather than erroring.
 *
 * There are four ways to arrive already authenticated, and they must all agree:
 *   1. email/password sign-in     → decided here, before navigating
 *   2. email/password sign-up     → same
 *   3. OAuth (`redirectTo`)       → the provider gets a fixed URL *before* we know who logged
 *                                   in, so it cannot be decided in advance — the onboarding
 *                                   guard catches it on landing
 *   4. a bookmark or the back button straight to `/onboarding/about` → same guard
 *
 * Hence one helper, two call sites: `AuthForm` (no onboarding flash on the common path) and
 * `useSkipOnboardingIfPlanned` (the catch-all).
 */

import { getActivePlan, type TriflowClient } from '@ironflow/api-client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSupabase } from './supabase';

export const ONBOARDING_START = '/onboarding/about';
export const APP_HOME = '/today';

/**
 * `/today` when the athlete already has an active plan, `/onboarding/about` when they don't.
 *
 * Failure direction is deliberate: **anything we can't answer sends them to onboarding.**
 * Stranding a genuinely new athlete on a dashboard with no plan and no route into onboarding is
 * unrecoverable for them; being sent through onboarding once more is merely annoying — and the
 * *consequence* of that (a duplicate plan) is blocked at the write instead, in
 * `PlanGeneration`, which is where the damage would actually happen.
 *
 * Note `getActivePlan` swallows its query error and returns null, so "no plan" and "the read
 * failed" are indistinguishable here by design of that function.
 */
export async function postAuthDestination(client: TriflowClient): Promise<string> {
  try {
    const { data } = await client.auth.getUser();
    if (!data.user) return ONBOARDING_START;
    return (await getActivePlan(client, data.user.id)) ? APP_HOME : ONBOARDING_START;
  } catch {
    return ONBOARDING_START;
  }
}

/**
 * Guard for the onboarding entry point: bounce to the app if there is already a plan.
 *
 * Returns `checking` so the page can hold off rendering its form for the one round trip it takes
 * to find out — otherwise a returning athlete sees the "about you" form flash up before being
 * redirected, which looks exactly like the bug we are fixing.
 */
export function useSkipOnboardingIfPlanned(): { checking: boolean } {
  const supabase = useSupabase();
  const router = useRouter();
  const [checking, setChecking] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void (async () => {
      const destination = await postAuthDestination(supabase);
      if (!alive) return;
      if (destination === APP_HOME) router.replace(APP_HOME);
      else setChecking(false);
    })();
    return () => {
      alive = false;
    };
  }, [supabase, router]);

  return { checking };
}

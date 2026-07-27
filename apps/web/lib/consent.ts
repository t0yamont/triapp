'use client';

/**
 * lib/consent.ts — read and refresh the athlete's consent (02-ARCHITECTURE.md §7).
 *
 * The policy itself is in `@ironflow/core/consent`; this is only the round trip.
 *
 * **Failure direction matters.** A profile that positively reports a gap gets the prompt; a read
 * that *fails* does not. Consent is on record in the database either way, so a transient network
 * error carries no compliance risk — whereas locking an athlete out of their training plan because
 * a query timed out is a real harm, and one they cannot fix.
 */

import { consentStatus, grantConsent, type ConsentStatus } from '@ironflow/core/consent';
import { useCallback, useEffect, useState } from 'react';
import { useSupabase } from './supabase';

export interface ConsentState {
  status: ConsentStatus | null;
  loading: boolean;
  /** Re-record consent at the current version. */
  accept: () => Promise<void>;
}

export function useConsent(): ConsentState {
  const supabase = useSupabase();
  const [status, setStatus] = useState<ConsentStatus | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return setStatus(null);
    const { data, error } = await supabase
      .from('profiles')
      .select('health_data_consent_at, health_data_consent_version, medical_disclaimer_ack_at')
      .eq('id', auth.user.id)
      .maybeSingle();
    if (error || !data) return setStatus(null);
    setStatus(
      consentStatus({
        healthDataConsentAt: data.health_data_consent_at,
        healthDataConsentVersion: data.health_data_consent_version,
        medicalDisclaimerAckAt: data.medical_disclaimer_ack_at,
      }),
    );
  }, [supabase]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        await load();
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const accept = useCallback(async () => {
    if (!supabase) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase
      .from('profiles')
      .update(grantConsent(new Date().toISOString()))
      .eq('id', auth.user.id);
    if (error) throw new Error(error.message);
    await load();
  }, [supabase, load]);

  return { status, loading, accept };
}

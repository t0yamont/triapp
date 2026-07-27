'use client';

/**
 * Account — sign out.
 *
 * The button existed and did nothing, so an athlete could not log out of an account holding their
 * health data. On a shared machine that is the whole of the problem.
 */

import { Button, Card } from '@ironflow/ui';
import { useState } from 'react';
import { supabaseConfigured, useSupabase } from '../../lib/supabase';

export function AccountCard() {
  const supabase = useSupabase();
  const [busy, setBusy] = useState(false);

  async function signOut(): Promise<void> {
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut();
    // A full navigation, not a router push: every hook in the shell holds athlete data in state,
    // and a client-side transition would keep the last athlete's numbers on screen.
    window.location.href = '/';
  }

  return (
    <Card className="flex flex-col gap-4">
      <span className="text-label uppercase tracking-widest text-faint">Account</span>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" onClick={() => void signOut()} disabled={busy || !supabaseConfigured()}>
          {busy ? 'Signing out…' : 'Sign out'}
        </Button>
        <span className="text-label text-faint">Export or delete your data above.</span>
      </div>
    </Card>
  );
}

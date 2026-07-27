'use client';

/**
 * Settings → Notifications. The toggles were decorative: no storage column, no producer, no
 * reader. Each one here switches a kind that something actually emits — the fourth ("Weekly
 * summary") is gone rather than left as a control that does nothing.
 */

import {
  DEFAULT_NOTIFICATION_PREFS,
  readNotificationPrefs,
  type NotificationKind,
  type NotificationPrefs,
} from '@ironflow/api-client';
import { Card } from '@ironflow/ui';
import { useEffect, useState } from 'react';
import { useSupabase } from '../../lib/supabase';

const LABELS: Record<NotificationKind, { title: string; hint: string }> = {
  plan_change: { title: 'Plan changes & adaptations', hint: 'When the engine changes a session, and why.' },
  test_due: { title: 'Scheduled test reminders', hint: 'A field test that has come due (§12).' },
  check_in_reminder: { title: 'Morning check-in', hint: 'A nudge on a day you haven’t logged one.' },
};

function Toggle({ on, onChange, title, hint, disabled }: { on: boolean; onChange: () => void; title: string; hint: string; disabled: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onChange}
      disabled={disabled}
      className="flex items-center justify-between gap-4 py-2.5 text-left disabled:opacity-50"
    >
      <span className="flex flex-col">
        <span className="text-body text-text">{title}</span>
        <span className="text-label text-faint">{hint}</span>
      </span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-white/12'}`} aria-hidden>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

export function NotificationSettingsCard() {
  const supabase = useSupabase();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from('profiles').select('notification_prefs').eq('id', auth.user.id).maybeSingle();
      if (alive && data) setPrefs(readNotificationPrefs(data.notification_prefs));
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  async function toggle(kind: NotificationKind): Promise<void> {
    if (!supabase) return;
    // Optimistic: a toggle that waits for a round trip feels broken. Reverted if the write fails.
    const next = { ...prefs, [kind]: !prefs[kind] };
    setPrefs(next);
    setBusy(true);
    setError(null);
    const { data: auth } = await supabase.auth.getUser();
    const { error: writeError } = auth.user
      ? await supabase.from('profiles').update({ notification_prefs: next }).eq('id', auth.user.id)
      : { error: { message: 'Sign in to change this.' } };
    if (writeError) {
      setPrefs(prefs);
      setError(writeError.message);
    }
    setBusy(false);
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-widest text-faint">Notifications</span>
        <span className="text-body text-muted">Shown in the app. Push to a phone arrives with the mobile app.</span>
      </div>
      <div className="flex flex-col divide-y divide-white/[0.06]">
        {(Object.keys(LABELS) as NotificationKind[]).map((kind) => (
          <Toggle key={kind} on={prefs[kind]} onChange={() => void toggle(kind)} disabled={busy} {...LABELS[kind]} />
        ))}
      </div>
      {error && <p className="text-label text-risk">{error}</p>}
    </Card>
  );
}

'use client';

/**
 * PrivacyCard — right of access and right to erasure, self-service (02-ARCHITECTURE.md §7).
 *
 * §7 requires both to be reachable "from settings" without emailing anyone. The Account section
 * used to carry an **Export my data** button wired to nothing, which is worse than no button: it
 * looks like a working right.
 *
 * The export runs in the browser under RLS, so it can only ever return the signed-in athlete's own
 * rows. Deletion goes through `/api/account` because the `auth.users` row needs the service role.
 */

import { exportAthleteData, isExportComplete } from '@ironflow/api-client';
import { CONSENT_VERSION } from '@ironflow/core/consent';
import { Button, Card } from '@ironflow/ui';
import { useState } from 'react';
import { useConsent } from '../../lib/consent';
import { supabaseConfigured, useSupabase } from '../../lib/supabase';

const CONFIRM_PHRASE = 'DELETE';

function download(filename: string, body: string): void {
  const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function PrivacyCard() {
  const supabase = useSupabase();
  const { status } = useConsent();
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [phrase, setPhrase] = useState('');

  async function runExport(): Promise<void> {
    if (!supabase) return;
    setBusy('export');
    setError(null);
    setNote(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Sign in to export your data.');
      const now = new Date().toISOString();
      const exported = await exportAthleteData(supabase, auth.user.id, now);

      // An export with a failed read in it is not a lawful response to a subject-access request,
      // so it is never handed over as though it were complete.
      if (!isExportComplete(exported)) {
        throw new Error(
          `Could not read ${exported.errors.map((e) => e.table).join(', ')}. Nothing was downloaded — please try again.`,
        );
      }
      download(`triflow-export-${now.slice(0, 10)}.json`, JSON.stringify(exported, null, 2));
      const rows = Object.values(exported.tables).reduce((n, t) => n + t.length, 0);
      setNote(`Exported ${rows} rows across ${Object.keys(exported.tables).length} tables.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Export failed.');
    } finally {
      setBusy(null);
    }
  }

  async function runDelete(): Promise<void> {
    if (!supabase || phrase !== CONFIRM_PHRASE) return;
    setBusy('delete');
    setError(null);
    setNote(null);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error('Sign in to delete your account.');

      const response = await fetch('/api/account', {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });
      const body = (await response.json()) as { error?: string; verified?: boolean; remaining?: Record<string, number> };
      if (!response.ok) throw new Error(body.error ?? 'Deletion failed.');

      if (body.verified === false) {
        // The delete ran but the re-count still found rows. Saying "done" here would be the
        // "probably deleted" position §7 exists to rule out.
        const left = Object.entries(body.remaining ?? {})
          .filter(([, n]) => n > 0)
          .map(([table]) => table);
        throw new Error(`Deletion could not be verified — data remains in ${left.join(', ')}. Please contact support.`);
      }

      await supabase.auth.signOut();
      window.location.href = '/';
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Deletion failed.');
      setBusy(null);
    }
  }

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-widest text-faint">Your data</span>
        <span className="text-body text-muted">
          TriFlow provides training guidance, not medical advice. Your health data is special-category personal
          data: you can take a copy of all of it, or have it destroyed, at any time.
        </span>
      </div>

      {status && (
        <div className="flex items-center justify-between gap-4 rounded-control border border-white/[0.06] bg-white/[0.02] px-4 py-3">
          <div className="flex flex-col">
            <span className="text-body text-text">Health-data consent</span>
            <span className="text-label text-faint">
              {status.current
                ? `Given · policy ${status.acceptedVersion ?? CONSENT_VERSION}`
                : 'Outstanding — you will be asked next time you open the app'}
            </span>
          </div>
          <span
            className={`h-2 w-2 rounded-full ${status.current ? 'bg-ok shadow-[0_0_8px_rgba(53,214,164,0.7)]' : 'bg-risk'}`}
            aria-hidden
          />
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => void runExport()} disabled={busy !== null || !supabaseConfigured()}>
            {busy === 'export' ? 'Preparing…' : 'Export my data'}
          </Button>
          <span className="text-label text-faint">Everything we hold, as JSON.</span>
        </div>

        {!confirming ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="ghost" onClick={() => setConfirming(true)} disabled={busy !== null || !supabaseConfigured()}>
              Delete my account
            </Button>
            <span className="text-label text-faint">Permanent, and it cannot be undone.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-control border border-risk/30 bg-risk/[0.06] p-4">
            <p className="text-label text-muted">
              This deletes your profile, activities, plans and connections, and revokes access at every connected
              provider. Export first if you want a copy — afterwards there is nothing left to export.
            </p>
            <label className="flex flex-col gap-1.5 text-label text-muted" htmlFor="confirm-delete">
              Type <span className="font-mono text-text">{CONFIRM_PHRASE}</span> to confirm
              <input
                id="confirm-delete"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
                className="w-40 rounded-control border border-white/10 bg-white/[0.04] px-3 py-2 font-mono text-body text-text outline-none focus:border-accent"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => void runDelete()} disabled={phrase !== CONFIRM_PHRASE || busy !== null}>
                {busy === 'delete' ? 'Deleting…' : 'Delete permanently'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setConfirming(false);
                  setPhrase('');
                }}
                disabled={busy !== null}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      {note && <p className="text-label text-ok">{note}</p>}
      {error && <p className="text-label text-risk">{error}</p>}
    </Card>
  );
}

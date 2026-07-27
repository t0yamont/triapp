'use client';

/**
 * ConsentGate — stop processing when there is no lawful basis to (02-ARCHITECTURE.md §7).
 *
 * A banner would be the easy version, and the wrong one: consent to v1 of the policy is not
 * consent to v2, so while it is outstanding the app has no basis to keep showing an athlete a plan
 * built from their health data. It blocks, and the only way past it is to agree.
 *
 * It renders **only** when a profile positively reports a gap — see `lib/consent.ts` for why a
 * failed read must not trigger it.
 */

import { CONSENT_VERSION, type ConsentGap } from '@ironflow/core/consent';
import { Button } from '@ironflow/ui';
import { useState } from 'react';
import { useConsent } from '../lib/consent';

const GAP_COPY: Record<ConsentGap, string> = {
  health_data_missing:
    'I consent to TriFlow processing my health and fitness data (special-category data) to build my physiological model and training plan.',
  health_data_outdated:
    'I consent to TriFlow processing my health and fitness data (special-category data) to build my physiological model and training plan.',
  medical_disclaimer_missing:
    'I understand TriFlow provides training guidance, not medical advice, and that I should seek medical clearance before beginning a training programme.',
};

export function ConsentGate() {
  const { status, loading, accept } = useConsent();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading || !status || status.current) return null;

  const updated = status.gaps.includes('health_data_outdated');
  // Deduped: the two health-data gaps share one paragraph and are mutually exclusive anyway.
  const paragraphs = [...new Set(status.gaps.map((gap) => GAP_COPY[gap]))];

  async function agree(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await accept();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save that. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-gate-title"
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 px-5 backdrop-blur-md"
    >
      <div className="glass-raised flex w-full max-w-lg flex-col gap-4 rounded-sheet p-6">
        <div className="flex flex-col gap-1.5">
          <span className="text-label uppercase tracking-widest text-faint">
            {updated ? `Policy updated · ${status.acceptedVersion} → ${CONSENT_VERSION}` : 'One thing first'}
          </span>
          <h2 id="consent-gate-title" className="text-h2 text-text">
            {updated ? 'We need your consent again' : 'Your consent'}
          </h2>
          <p className="text-body text-muted">
            {updated
              ? 'Our health-data policy has changed since you agreed to it, so we have paused using your data until you confirm.'
              : 'TriFlow builds your plan from health data, which needs your explicit consent.'}
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-control border border-white/10 bg-white/[0.03] p-4">
          {paragraphs.map((text) => (
            <p key={text} className="text-label text-muted">
              {text}
            </p>
          ))}
        </div>

        {error && <p className="text-label text-risk">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void agree()} disabled={busy}>
            {busy ? 'Saving…' : 'I agree'}
          </Button>
          <a href="/settings" className="text-label text-faint underline decoration-white/20 underline-offset-4">
            Export or delete my data instead
          </a>
        </div>
      </div>
    </div>
  );
}

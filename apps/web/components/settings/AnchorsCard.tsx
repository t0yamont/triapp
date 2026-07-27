'use client';

/**
 * The athlete's threshold anchors, as actually stored.
 *
 * This replaces five hardcoded constants — "LT2 · threshold HR 168 bpm · field test · 12 days
 * ago", "Critical Power 268 W" — that were rendered with confidence dots and provenance labels
 * as though measured. Inventing physiological values and presenting them as an athlete's own is
 * the failure `CLAUDE.md` names directly: plausible-looking output that is wrong in ways nobody
 * notices for months. An empty state is the honest answer until an anchor exists.
 */

import { getCurrentAnchors } from '@ironflow/api-client';
import { dfaHrSpreadBpm } from '@ironflow/core/physio';
import { Card, ConfidenceDot } from '@ironflow/ui';
import { useEffect, useState } from 'react';
import { useSupabase } from '../../lib/supabase';

/** Anchor types the athlete sees, in the order they matter, with their display unit. */
const ANCHOR_LABEL: Record<string, { label: string; unit: string; dp: number }> = {
  lt2: { label: 'LT2 · threshold HR', unit: 'bpm', dp: 0 },
  lt1: { label: 'LT1 · aerobic HR', unit: 'bpm', dp: 0 },
  critical_power: { label: 'Critical Power', unit: 'W', dp: 0 },
  critical_speed: { label: 'Critical Speed', unit: 'm/s', dp: 2 },
  css: { label: 'Critical Swim Speed', unit: 'm/s', dp: 3 },
  hr_max: { label: 'Max HR', unit: 'bpm', dp: 0 },
  hr_rest: { label: 'Resting HR', unit: 'bpm', dp: 0 },
};

const ORDER = Object.keys(ANCHOR_LABEL);

/** How the value was arrived at, in the athlete's words rather than the enum's. */
const PROVENANCE_LABEL: Record<string, string> = {
  field_test: 'field test',
  css_test: 'swim time trial',
  cp_model_fit: 'fitted from your training',
  dfa_a1_single: 'HRV analysis, one session',
  dfa_a1_multi: 'HRV analysis, several sessions',
  observed_max: 'highest seen in training',
  age_formula: 'age estimate — not measured',
  user_entered: 'you entered it',
  overnight_mean: 'overnight average',
};

/**
 * The ± spread to show beside an HRV-derived heart rate (§6.1), or null for an anchor measured
 * some other way. Only DFA-a1 provenances carry it — a field-test LT2 is a different kind of
 * number and borrowing HRV's error bars would misrepresent it.
 */
function spreadFor(a: { type: string; provenance: string }): number | null {
  if (!a.provenance.startsWith('dfa_a1')) return null;
  if (a.type !== 'lt1' && a.type !== 'lt2') return null;
  return dfaHrSpreadBpm(a.type);
}

function daysAgo(iso: string, now: number): string {
  const days = Math.floor((now - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 60) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

export function AnchorsCard() {
  const supabase = useSupabase();
  const [anchors, setAnchors] = useState<{ type: string; sport: string | null; value: number; confidence: number; provenance: string; measuredAt: string }[] | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!supabase) return setChecked(true);
    let alive = true;
    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return;
        const rows = await getCurrentAnchors(supabase, auth.user.id);
        if (!alive) return;
        setAnchors(
          rows
            .filter((r) => r.value_numeric !== null && ANCHOR_LABEL[r.anchor_type])
            .map((r) => ({
              type: r.anchor_type,
              sport: r.sport,
              value: Number(r.value_numeric),
              confidence: Number(r.confidence),
              provenance: r.provenance,
              measuredAt: r.measured_at,
            }))
            .sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type)),
        );
      } catch {
        /* nothing to show */
      } finally {
        if (alive) setChecked(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  if (!checked) return null;

  const now = Date.now();

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-widest text-faint">Thresholds &amp; zones</span>
        <span className="text-body text-muted">
          Everything is anchored to these. Low-confidence anchors make the plan more conservative and schedule a test
          sooner (§2.4).
        </span>
      </div>

      {anchors && anchors.length > 0 ? (
        <div className="flex flex-col gap-2">
          {anchors.map((a) => {
            const meta = ANCHOR_LABEL[a.type]!;
            return (
              <div key={`${a.type}-${a.sport ?? 'all'}`} className="flex items-center justify-between gap-4 rounded-control border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="flex flex-col gap-1">
                  <span className="text-body text-text">
                    {meta.label}
                    {a.sport ? <span className="text-faint"> · {a.sport}</span> : null}
                  </span>
                  <ConfidenceDot
                    confidence={a.confidence}
                    label={`${PROVENANCE_LABEL[a.provenance] ?? a.provenance} · ${daysAgo(a.measuredAt, now)}`}
                  />
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="font-mono text-h2 tabular-nums text-text">{a.value.toFixed(meta.dp)}</span>
                  {/* §6.1's honesty requirement: an HRV-derived threshold has a typical error of
                      6–8 bpm — a whole zone — and must never be shown as a bare definitive
                      number. Aggregation raises the *confidence*, not the measurement error, so
                      the spread is shown either way. */}
                  {spreadFor(a) !== null && (
                    <span className="font-mono text-label tabular-nums text-faint">±{spreadFor(a)}</span>
                  )}
                  <span className="text-label text-faint">{meta.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-label text-faint">
          Nothing measured yet. Anchors appear here as they are derived from your training — or record a swim time
          trial above to set one directly.
        </p>
      )}
    </Card>
  );
}

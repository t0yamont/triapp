'use client';

/**
 * The athlete's HR zones as actually derived and stored (§2/§3) — the first place the
 * athlete model is visible at all.
 *
 * Zones built from an age formula are an estimate, and §2.4/P2 require saying so rather than
 * presenting a bpm range as measured fact. The anchor mode and confidence are shown, never
 * hidden behind clean-looking numbers.
 */

import { getAthleteModel, getCurrentZones } from '@ironflow/api-client';
import { Card, ConfidenceDot } from '@ironflow/ui';
import type { AthleteModel, ZoneSet } from '@ironflow/core/physio';
import { useEffect, useState } from 'react';
import { useSupabase } from '../../lib/supabase';

interface Loaded {
  model: AthleteModel;
  confidence: number;
  zones: { sport: string; zoneSet: ZoneSet }[];
}

export function ZonesCard() {
  const supabase = useSupabase();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!supabase) return setChecked(true);
    let alive = true;
    void (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const athleteId = auth.user?.id;
        if (!athleteId) return;
        const [row, zoneRows] = await Promise.all([
          getAthleteModel(supabase, athleteId),
          getCurrentZones(supabase, athleteId),
        ]);
        if (!alive || !row) return;
        setLoaded({
          model: row.model as unknown as AthleteModel,
          confidence: Number(row.combined_confidence),
          zones: zoneRows.map((z) => ({ sport: z.sport, zoneSet: z.zones as unknown as ZoneSet })),
        });
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

  if (!loaded) {
    return (
      <Card className="flex flex-col gap-2">
        <span className="text-label uppercase tracking-widest text-faint">Your zones</span>
        <p className="text-body text-muted">
          Not built yet. Zones need a resting heart rate — log a morning check-in on Today and they&rsquo;ll
          be derived from it.
        </p>
      </Card>
    );
  }

  const { model, confidence, zones } = loaded;
  const run = zones.find((z) => z.sport === 'run')?.zoneSet ?? zones[0]?.zoneSet;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-label uppercase tracking-widest text-faint">Your zones</span>
        <ConfidenceDot confidence={confidence} label="how well your anchors are known" />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 font-mono text-mono tabular-nums text-muted">
        <span>
          HRmax <span className="text-text">{Math.round(model.hrMax.value)}</span> bpm
        </span>
        <span>
          HRrest <span className="text-text">{Math.round(model.hrRest.value)}</span> bpm
        </span>
        <span>
          Reserve <span className="text-text">{model.hrReserve}</span> bpm
        </span>
      </div>

      {run ? (
        <div className="flex flex-col gap-1.5">
          {run.zones.map((z) => (
            <div key={z.id} className="flex items-center justify-between gap-3 text-label">
              <span className="text-muted">
                <span className="text-text">{z.id}</span> · {z.name}
              </span>
              <span className="font-mono tabular-nums text-faint">
                {z.lower.bpm}–{z.upper.bpm} bpm
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <p className="text-label text-faint">
        {run?.mode === 'hrr_fallback'
          ? 'Built from heart-rate reserve, because your lactate thresholds haven’t been measured yet — a field test will sharpen these.'
          : 'Anchored to your measured thresholds.'}{' '}
        {model.hrMax.provenance === 'population_formula'
          ? 'HRmax is an age-based estimate, not a measurement.'
          : null}
      </p>
    </Card>
  );
}

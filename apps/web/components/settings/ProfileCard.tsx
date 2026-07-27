'use client';

/**
 * Profile — name, units, timezone, week start.
 *
 * Was a form pre-filled with "Sample Athlete" and a Save button wired to nothing, so an athlete
 * could correct their timezone, press Save, and watch the plan keep computing days in the wrong
 * zone (hard rule 8 — the most common class of bug in this domain).
 *
 * Timezone is a free-text IANA field, matching onboarding: a two-entry dropdown was worse than
 * useless for anyone outside London or New York, and the browser knows the right default anyway.
 */

import { Button, Card, Field, Input, Select } from '@ironflow/ui';
import { useEffect, useState } from 'react';
import { supabaseConfigured, useSupabase } from '../../lib/supabase';

interface Profile {
  display_name: string;
  units: 'metric' | 'imperial';
  timezone: string;
  week_start_day: number;
}

const EMPTY: Profile = { display_name: '', units: 'metric', timezone: 'Europe/London', week_start_day: 1 };

export function ProfileCard() {
  const supabase = useSupabase();
  const [profile, setProfile] = useState<Profile>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from('profiles')
        .select('display_name, units, timezone, week_start_day')
        .eq('id', auth.user.id)
        .maybeSingle();
      if (!alive || !data) return;
      setProfile({
        display_name: data.display_name ?? '',
        units: data.units as Profile['units'],
        timezone: data.timezone,
        week_start_day: data.week_start_day,
      });
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  async function save(): Promise<void> {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setBusy(false);
      return setError('Sign in to change your profile.');
    }
    const { error: writeError } = await supabase.from('profiles').update(profile).eq('id', auth.user.id);
    setBusy(false);
    if (writeError) return setError(writeError.message);
    setSaved(true);
  }

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    setProfile((p) => ({ ...p, [key]: value }));
    setSaved(false);
  };

  return (
    <Card className="flex flex-col gap-5">
      <span className="text-label uppercase tracking-widest text-faint">Profile</span>
      <div className="flex flex-col gap-4">
        <Field label="Name" htmlFor="name">
          <Input id="name" value={profile.display_name} onChange={(e) => set('display_name', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Units" htmlFor="units">
            <Select id="units" value={profile.units} onChange={(e) => set('units', e.target.value as Profile['units'])}>
              <option value="metric">Metric (km, kg)</option>
              <option value="imperial">Imperial (mi, lb)</option>
            </Select>
          </Field>
          <Field label="Week starts" htmlFor="weekStart">
            <Select
              id="weekStart"
              value={String(profile.week_start_day)}
              onChange={(e) => set('week_start_day', Number(e.target.value))}
            >
              <option value="1">Monday</option>
              <option value="0">Sunday</option>
            </Select>
          </Field>
        </div>
        <Field label="Timezone (IANA)" htmlFor="tz" hint="Training days are computed in your local zone.">
          <Input id="tz" value={profile.timezone} onChange={(e) => set('timezone', e.target.value)} />
        </Field>
        <div className="flex items-center gap-3">
          <Button onClick={() => void save()} disabled={busy || !loaded || !supabaseConfigured()}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
          {saved && <span className="text-label text-ok">Saved.</span>}
          {error && <span className="text-label text-risk">{error}</span>}
        </div>
      </div>
    </Card>
  );
}

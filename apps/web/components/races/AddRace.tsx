'use client';

/**
 * Add a race.
 *
 * The button existed and did nothing, so a race could only ever be entered during onboarding —
 * an athlete who signed up in January could not tell the app about a race they entered in March,
 * which is the event the whole plan is supposed to be built around.
 *
 * Deliberately does not regenerate the plan. A new A race changes the macrocycle and that is
 * `weeklyReplan`'s and the plan generator's job, not a side effect of a form; the race is
 * recorded and the athlete is told what happens next.
 */

import { EVENT_META } from '../../lib/eventMeta';
import type { EventType } from '@ironflow/core/physio';
import { Button, Card, Field, Input, Select } from '@ironflow/ui';
import { useState } from 'react';
import { supabaseConfigured, useSupabase } from '../../lib/supabase';

const PRIORITIES = [
  { value: 'A', label: 'A — the race the plan is built around' },
  { value: 'B', label: 'B — a local peak, trained through' },
  { value: 'C', label: 'C — trained straight through' },
] as const;

export function AddRace({ onAdded }: { onAdded: () => void }) {
  const supabase = useSupabase();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [raceDate, setRaceDate] = useState('');
  const [eventType, setEventType] = useState<EventType>('olympic_tri');
  const [priority, setPriority] = useState<'A' | 'B' | 'C'>('A');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const valid = name.trim().length > 0 && raceDate > today;

  async function save(): Promise<void> {
    if (!supabase || !valid) return;
    setBusy(true);
    setError(null);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setBusy(false);
      return setError('Sign in to add a race.');
    }
    const { error: writeError } = await supabase.from('races').insert({
      athlete_id: auth.user.id,
      name: name.trim(),
      race_date: raceDate,
      priority,
      event_type: eventType,
    });
    setBusy(false);
    if (writeError) return setError(writeError.message);
    setOpen(false);
    setName('');
    setRaceDate('');
    onAdded();
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={!supabaseConfigured()}>
        Add a race
      </Button>
    );
  }

  return (
    <Card className="flex w-full flex-col gap-4 lg:w-[420px]">
      <span className="text-label uppercase tracking-widest text-faint">Add a race</span>
      <Field label="Name" htmlFor="raceName">
        <Input id="raceName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Outlaw Half" />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date" htmlFor="raceDate" error={raceDate !== '' && raceDate <= today ? 'Must be in the future.' : undefined}>
          <Input id="raceDate" type="date" min={today} value={raceDate} onChange={(e) => setRaceDate(e.target.value)} />
        </Field>
        <Field label="Priority" htmlFor="priority">
          <Select id="priority" value={priority} onChange={(e) => setPriority(e.target.value as 'A' | 'B' | 'C')}>
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.value}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Event" htmlFor="eventType" hint={PRIORITIES.find((p) => p.value === priority)!.label}>
        <Select id="eventType" value={eventType} onChange={(e) => setEventType(e.target.value as EventType)}>
          {(Object.keys(EVENT_META) as EventType[]).map((type) => (
            <option key={type} value={type}>
              {EVENT_META[type].label}
            </option>
          ))}
        </Select>
      </Field>
      {error && <p className="text-label text-risk">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void save()} disabled={!valid || busy}>
          {busy ? 'Saving…' : 'Add race'}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
        <span className="text-label text-faint">Your plan isn’t rebuilt automatically.</span>
      </div>
    </Card>
  );
}

'use client';

import { Button, Card, Field, Input, Select } from '@ironflow/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { NotConnectedBanner } from '../../../components/NotConnectedBanner';
import { WEEKDAYS } from '../../../lib/days';
import { supabaseConfigured, useSupabase } from '../../../lib/supabase';

export default function AvailabilityPage() {
  const supabase = useSupabase();
  const router = useRouter();
  const [minutes, setMinutes] = useState<Record<number, string>>({});
  const [swimDays, setSwimDays] = useState<number[]>([]);
  const [longRideDay, setLongRideDay] = useState<string>('');
  const [longRunDay, setLongRunDay] = useState<string>('');
  const [gymAccess, setGymAccess] = useState(false);
  const [saunaAccess, setSaunaAccess] = useState(false);
  const [weeklyTarget, setWeeklyTarget] = useState('');
  const [weeklyMax, setWeeklyMax] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleSwim(index: number) {
    setSwimDays((d) => (d.includes(index) ? d.filter((i) => i !== index) : [...d, index]));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const target = Number(weeklyTarget);
    const max = Number(weeklyMax);
    if (!(target > 0)) return setError('Enter a weekly hours target.');
    if (!(max >= target)) return setError('The weekly ceiling must be at least your target.');

    const dayMinutes: Record<string, number> = {};
    for (const day of WEEKDAYS) {
      const m = Number(minutes[day.index]);
      if (Number.isFinite(m) && m > 0) dayMinutes[String(day.index)] = m;
    }

    if (!supabase) return;
    setBusy(true);
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setBusy(false);
      return setError('Please sign in first.');
    }
    const { error: dbError } = await supabase.from('athlete_availability').upsert({
      athlete_id: data.user.id,
      weekly_hours_target: target,
      weekly_hours_max: max,
      day_minutes: dayMinutes,
      swim_days: swimDays,
      long_ride_day: longRideDay === '' ? null : Number(longRideDay),
      long_run_day: longRunDay === '' ? null : Number(longRunDay),
      gym_access: gymAccess,
      sauna_access: saunaAccess,
      notes: notes || null,
    });
    setBusy(false);
    if (dbError) return setError(dbError.message);
    router.push('/today');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <header className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-widest text-faint">Step 6 of 8</span>
        <h1 className="text-h1 text-text">Your availability</h1>
        <p className="text-body text-muted">
          The single biggest driver of whether you follow the plan. A plan built on guessed
          availability won&apos;t be followed, so this one isn&apos;t skippable.
        </p>
      </header>

      <Card>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          {!supabaseConfigured() && <NotConnectedBanner />}

          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-label text-faint">
              <span>Day</span>
              <span className="w-24 text-right">Minutes</span>
              <span className="w-12 text-center">Swim</span>
            </div>
            {WEEKDAYS.map((day) => (
              <div key={day.index} className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
                <span className="text-body text-text">{day.long}</span>
                <Input
                  type="number"
                  min={0}
                  step={15}
                  placeholder="0"
                  className="w-24 text-right font-mono"
                  value={minutes[day.index] ?? ''}
                  onChange={(e) => setMinutes((m) => ({ ...m, [day.index]: e.target.value }))}
                  aria-label={`${day.long} minutes`}
                />
                <span className="flex w-12 justify-center">
                  <input
                    type="checkbox"
                    checked={swimDays.includes(day.index)}
                    onChange={() => toggleSwim(day.index)}
                    aria-label={`Can swim on ${day.long}`}
                  />
                </span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Long ride day" htmlFor="lrd">
              <Select id="lrd" value={longRideDay} onChange={(e) => setLongRideDay(e.target.value)}>
                <option value="">None</option>
                {WEEKDAYS.map((d) => (
                  <option key={d.index} value={d.index}>
                    {d.long}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Long run day" htmlFor="lrunday">
              <Select id="lrunday" value={longRunDay} onChange={(e) => setLongRunDay(e.target.value)}>
                <option value="">None</option>
                {WEEKDAYS.map((d) => (
                  <option key={d.index} value={d.index}>
                    {d.long}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Weekly hours target" htmlFor="wht">
              <Input id="wht" type="number" min={0} step={0.5} className="font-mono" value={weeklyTarget} onChange={(e) => setWeeklyTarget(e.target.value)} />
            </Field>
            <Field label="Weekly ceiling (never exceed)" htmlFor="whm">
              <Input id="whm" type="number" min={0} step={0.5} className="font-mono" value={weeklyMax} onChange={(e) => setWeeklyMax(e.target.value)} />
            </Field>
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-label text-muted">
              <input type="checkbox" checked={gymAccess} onChange={(e) => setGymAccess(e.target.checked)} /> Gym access
            </label>
            <label className="flex items-center gap-2 text-label text-muted">
              <input type="checkbox" checked={saunaAccess} onChange={(e) => setSaunaAccess(e.target.checked)} /> Sauna access
            </label>
          </div>

          <Field label="Notes (optional)" htmlFor="notes">
            <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the planner should know" />
          </Field>

          {error && <p className="text-label text-risk">{error}</p>}
          <Button type="submit" disabled={busy || !supabase}>
            Finish
          </Button>
        </form>
      </Card>
    </main>
  );
}

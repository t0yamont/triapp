'use client';

/**
 * The morning check-in — the input side of §10.1. Readiness is scored from rolling means
 * against a 60-day baseline, so a single check-in never produces a score on its own; this
 * card says how far off that is rather than showing a number it can't stand behind.
 */

import type { DailyCheckIn } from '@ironflow/api-client';
import type { ReadinessCoverage } from '@ironflow/core/physio';
import { Button, Card, Field, Input } from '@ironflow/ui';
import { useState } from 'react';

/** 1–5, higher is better throughout — the direction the engine's wellness mean assumes. */
const SCALES = [
  { key: 'wellnessFatigue', label: 'Freshness', low: 'Wiped', high: 'Fresh' },
  { key: 'wellnessSoreness', label: 'Muscles', low: 'Sore', high: 'Loose' },
  { key: 'wellnessStress', label: 'Stress', low: 'Frazzled', high: 'Calm' },
  { key: 'wellnessMood', label: 'Mood', low: 'Low', high: 'Good' },
] as const;

type ScaleKey = (typeof SCALES)[number]['key'];

export function CheckInCard({
  coverage,
  alreadyLogged,
  saving,
  error,
  onSubmit,
}: {
  coverage: ReadinessCoverage | null;
  alreadyLogged: boolean;
  saving: boolean;
  error: string | null;
  onSubmit: (checkIn: DailyCheckIn) => void;
}) {
  const [open, setOpen] = useState(false);
  const [scales, setScales] = useState<Partial<Record<ScaleKey, number>>>({});
  const [hrv, setHrv] = useState('');
  const [rhr, setRhr] = useState('');
  const [sleepH, setSleepH] = useState('');
  const [illness, setIllness] = useState(false);

  const num = (v: string): number | undefined => {
    const n = Number(v);
    return v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : undefined;
  };

  function submit() {
    const sleepHours = num(sleepH);
    onSubmit({
      ...scales,
      ...(num(hrv) !== undefined ? { hrvRmssd: num(hrv) } : {}),
      ...(num(rhr) !== undefined ? { restingHr: num(rhr) } : {}),
      ...(sleepHours !== undefined ? { sleepDurationMin: Math.round(sleepHours * 60) } : {}),
      illnessFlag: illness,
    });
    setOpen(false);
  }

  if (!open) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-body text-text">
            {alreadyLogged ? 'Checked in today' : 'How did you wake up?'}
          </span>
          <span className="text-label text-faint">
            <CoverageLine coverage={coverage} alreadyLogged={alreadyLogged} />
          </span>
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {alreadyLogged ? 'Update' : 'Check in'}
        </Button>
      </Card>
    );
  }

  return (
    <Card raised className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-widest text-faint">This morning</span>
        <span className="text-label text-faint">
          Answer what you know — anything you skip is treated as unknown, never as a zero.
        </span>
      </div>

      <div className="flex flex-col gap-3">
        {SCALES.map((scale) => (
          <div key={scale.key} className="flex flex-wrap items-center gap-3">
            <span className="w-24 shrink-0 text-label text-muted">{scale.label}</span>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-label={`${scale.label} ${v} of 5`}
                  aria-pressed={scales[scale.key] === v}
                  onClick={() => setScales((s) => ({ ...s, [scale.key]: v }))}
                  className={`h-8 w-8 rounded-control border font-mono text-label tabular-nums transition-colors ${
                    scales[scale.key] === v
                      ? 'border-accent/50 bg-accent/20 text-accent-bright'
                      : 'border-white/10 bg-white/[0.03] text-muted hover:border-white/25'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <span className="text-label text-faint">
              1 = {scale.low} · 5 = {scale.high}
            </span>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Sleep" htmlFor="sleepH" hint="hours">
          <Input id="sleepH" inputMode="decimal" value={sleepH} onChange={(e) => setSleepH(e.target.value)} placeholder="7.5" />
        </Field>
        <Field label="Resting HR" htmlFor="rhr" hint="bpm, optional">
          <Input id="rhr" inputMode="numeric" value={rhr} onChange={(e) => setRhr(e.target.value)} placeholder="48" />
        </Field>
        <Field label="HRV (rMSSD)" htmlFor="hrv" hint="ms, if you measure it">
          <Input id="hrv" inputMode="decimal" value={hrv} onChange={(e) => setHrv(e.target.value)} placeholder="62" />
        </Field>
      </div>

      <label className="flex items-center gap-2.5 text-body text-muted">
        <input
          type="checkbox"
          checked={illness}
          onChange={(e) => setIllness(e.target.checked)}
          className="h-4 w-4 rounded border-white/20 bg-white/[0.05]"
        />
        I feel ill today
      </label>

      {error ? <p className="text-body text-risk">{error}</p> : null}

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={saving}>
          {saving ? 'Saving…' : 'Save check-in'}
        </Button>
        <button type="button" onClick={() => setOpen(false)} className="text-label text-faint transition-colors hover:text-text">
          Cancel
        </button>
      </div>
    </Card>
  );
}

/** Says plainly how close the athlete is to a real score, instead of implying one exists. */
function CoverageLine({ coverage, alreadyLogged }: { coverage: ReadinessCoverage | null; alreadyLogged: boolean }) {
  if (!coverage) return <>Sign in to track readiness from your own mornings.</>;
  if (coverage.daysUntilFirstScore > 0) {
    const days = coverage.daysUntilFirstScore;
    return (
      <>
        {coverage.daysLogged} {coverage.daysLogged === 1 ? 'day' : 'days'} logged — {days} more before readiness
        can be scored against your own baseline.
      </>
    );
  }
  const tracked = coverage.available.length;
  return (
    <>
      {alreadyLogged ? 'Scored from' : 'Tracking'} {tracked} {tracked === 1 ? 'signal' : 'signals'} against your{' '}
      {coverage.daysLogged}-day history.
    </>
  );
}

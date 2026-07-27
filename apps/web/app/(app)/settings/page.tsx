'use client';

import { Button, Card, ConfidenceDot, Field, Input, Select } from '@ironflow/ui';
import { FieldTestCard } from '../../../components/settings/FieldTestCard';
import { PrivacyCard } from '../../../components/settings/PrivacyCard';
import { ZonesCard } from '../../../components/settings/ZonesCard';

interface Anchor {
  label: string;
  value: string;
  unit: string;
  confidence: number;
  provenance: string;
  lastTested: string;
}

// Athlete-model anchors (§2). Each carries its confidence + provenance — never a bare number.
const ANCHORS: Anchor[] = [
  { label: 'LT2 · threshold HR', value: '168', unit: 'bpm', confidence: 0.82, provenance: 'field test', lastTested: '12 days ago' },
  { label: 'LT1 · aerobic HR', value: '146', unit: 'bpm', confidence: 0.7, provenance: 'field test', lastTested: '12 days ago' },
  { label: 'Critical Power', value: '268', unit: 'W', confidence: 0.63, provenance: 'mean-max fit', lastTested: 'derived' },
  { label: 'Max HR', value: '186', unit: 'bpm', confidence: 0.9, provenance: 'observed max', lastTested: 'race · 40 days ago' },
  { label: 'Resting HR', value: '44', unit: 'bpm', confidence: 0.75, provenance: 'overnight mean', lastTested: '7-day' },
];

const DEVICES = [
  { name: 'Garmin Connect', connected: true, detail: 'Last sync 2h ago' },
  { name: 'Strava', connected: true, detail: 'Auto-import on' },
  { name: 'Apple Health', connected: false, detail: 'HRV, sleep & resting HR' },
];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-widest text-faint">{title}</span>
        {hint ? <span className="text-body text-muted">{hint}</span> : null}
      </div>
      {children}
    </Card>
  );
}

function Toggle({ on, label }: { on: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-body text-text">{label}</span>
      <span className={`relative h-6 w-10 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-white/12'}`} aria-hidden>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="flex animate-fade-rise flex-col gap-7">
      <header className="flex flex-col gap-2">
        <h1 className="text-display text-text">Settings</h1>
        <p className="max-w-2xl text-body text-muted">Your profile, connected devices, and the thresholds the whole plan is anchored to.</p>
      </header>

      <ZonesCard />
      <FieldTestCard />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
        <div className="flex flex-col gap-6">
          <Section title="Profile">
            <div className="flex flex-col gap-4">
              <Field label="Name" htmlFor="name">
                <Input id="name" defaultValue="Sample Athlete" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Units" htmlFor="units">
                  <Select id="units" defaultValue="metric">
                    <option value="metric">Metric (km, kg)</option>
                    <option value="imperial">Imperial (mi, lb)</option>
                  </Select>
                </Field>
                <Field label="Time zone" htmlFor="tz">
                  <Select id="tz" defaultValue="gb">
                    <option value="gb">Europe/London</option>
                    <option value="us">America/New_York</option>
                  </Select>
                </Field>
              </div>
              <div>
                <Button>Save changes</Button>
              </div>
            </div>
          </Section>

          <Section title="Connected devices" hint="Where your training and recovery data comes from.">
            <div className="flex flex-col gap-2">
              {DEVICES.map((d) => (
                <div key={d.name} className="flex items-center justify-between rounded-control border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`h-2 w-2 rounded-full ${d.connected ? 'bg-ok shadow-[0_0_8px_rgba(53,214,164,0.7)]' : 'bg-faint'}`} aria-hidden />
                    <div className="flex flex-col">
                      <span className="text-body text-text">{d.name}</span>
                      <span className="text-label text-faint">{d.detail}</span>
                    </div>
                  </div>
                  <Button variant={d.connected ? 'ghost' : 'secondary'}>{d.connected ? 'Disconnect' : 'Connect'}</Button>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Notifications">
            <div className="flex flex-col divide-y divide-white/[0.06]">
              <Toggle on label="Morning readiness & today's session" />
              <Toggle on label="Plan changes & adaptations" />
              <Toggle on={false} label="Weekly summary" />
              <Toggle on label="Scheduled test reminders" />
            </div>
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <Section title="Thresholds & zones" hint="Everything is anchored to these. Low-confidence anchors make the plan more conservative and schedule a test sooner (§2.4).">
            <div className="flex flex-col gap-2">
              {ANCHORS.map((a) => (
                <div key={a.label} className="flex items-center justify-between gap-4 rounded-control border border-white/[0.06] bg-white/[0.02] p-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-body text-text">{a.label}</span>
                    <ConfidenceDot confidence={a.confidence} label={`${a.provenance} · ${a.lastTested}`} />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-h2 tabular-nums text-text">{a.value}</span>
                    <span className="text-label text-faint">{a.unit}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary">Schedule a test</Button>
              <span className="text-label text-faint">Next due in ~2 weeks</span>
            </div>
          </Section>

          <PrivacyCard />

          <Section title="Account">
            <div className="flex flex-wrap gap-3">
              <Button variant="ghost">Sign out</Button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

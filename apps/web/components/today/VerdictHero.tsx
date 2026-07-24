import { Button, Card } from '@ironflow/ui';
import type { AdaptationResult, Readiness, SZone } from '@ironflow/core/physio';
import type { Climate } from '../../lib/climate';
import { CLIMATE_META } from '../../lib/climate';
import type { PlannedSession, ViewSport } from '../../lib/today-demo';

const SPORT_DOT: Record<ViewSport, string> = {
  run: 'bg-sport-run',
  bike: 'bg-sport-bike',
  swim: 'bg-sport-swim',
  strength: 'bg-sport-strength',
};
const SPORT_LABEL: Record<ViewSport, string> = { run: 'Run', bike: 'Bike', swim: 'Swim', strength: 'Strength' };

const ZONE: Record<SZone, { label: string; text: string; ring: string }> = {
  S1: { label: 'Aerobic', text: 'text-zone-z1', ring: 'border-zone-z1/40 bg-zone-z1/10' },
  S2: { label: 'Threshold', text: 'text-zone-z3', ring: 'border-zone-z3/40 bg-zone-z3/10' },
  S3: { label: 'VO₂ max', text: 'text-zone-z5', ring: 'border-zone-z5/40 bg-zone-z5/10' },
};

// The gradient the linear gauge fills with — reads the band, then goes premium (§2.4).
const GAUGE_STOPS: Record<Readiness['band'], [string, string]> = {
  below: ['#F4B740', '#FF6B7A'],
  within: ['#7C6CF5', '#34E0C8'],
  above: ['#35D6A4', '#6D8BFF'],
  unknown: ['#3A4152', '#3A4152'],
};
const VERDICT: Record<Readiness['band'], string> = {
  below: 'Ease off today',
  within: 'Clear for hard work',
  above: 'Primed for hard work',
  unknown: 'Not enough data yet',
};
const VERDICT_TEXT: Record<Readiness['band'], string> = {
  below: 'text-warn',
  within: 'text-accent-bright',
  above: 'text-ok',
  unknown: 'text-faint',
};

const hours = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
};

function AdaptationBanner({ adaptation }: { adaptation: AdaptationResult }) {
  if (adaptation.action === 'none' || !adaptation.mutation) return null;
  return (
    <div className="flex items-center gap-3 rounded-control border border-warn/25 bg-warn/[0.08] px-4 py-3">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="h-4 w-4 shrink-0 text-warn">
        <path d="M10 3.2 18 16.8H2L10 3.2ZM10 8v4.1M10 14.6v.1" />
      </svg>
      <p className="flex-1 text-label leading-snug text-text">{adaptation.mutation.reasonText}</p>
      <button type="button" className="shrink-0 rounded-full border border-white/[0.14] px-2.5 py-1 text-label text-muted hover:text-text">
        Undo
      </button>
    </div>
  );
}

/**
 * The verdict line: one hero fusing today's session with today's readiness — the decision
 * and its evidence in a single glance (§16 "the athlete grasps today's decision in seconds").
 * Session (what to do) sits left; readiness (why) sits right behind a hairline divider,
 * reading as a linear instrument rather than a ring so score and gauge share one baseline.
 */
export function VerdictHero({
  session,
  adaptation,
  effectiveZone,
  readiness,
  readinessLine,
  climate,
  dateLabel,
}: {
  session: PlannedSession;
  adaptation: AdaptationResult;
  effectiveZone: SZone;
  readiness: Readiness;
  readinessLine: string;
  climate: Climate;
  dateLabel: string;
}) {
  const zone = ZONE[effectiveZone];
  const cl = CLIMATE_META[climate];
  const [from, to] = GAUGE_STOPS[readiness.band];
  const score = Math.max(0, Math.min(100, readiness.score));

  return (
    <Card raised className="flex flex-col gap-7 lg:flex-row lg:items-stretch lg:gap-8">
      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-label uppercase tracking-widest text-faint">{dateLabel}</span>
          <span className="h-1 w-1 rounded-full bg-faint" aria-hidden />
          <span className="inline-flex items-center gap-1.5 text-label text-muted">
            <span className={`h-1.5 w-1.5 rounded-full ${SPORT_DOT[session.sport]}`} aria-hidden />
            {SPORT_LABEL[session.sport]}
          </span>
        </div>

        <div className="flex flex-wrap items-baseline gap-3.5">
          <h1 className="text-stat text-text">{session.name}</h1>
          <span className={`rounded-full border px-3 py-1 font-mono text-label ${zone.ring} ${zone.text}`}>
            {effectiveZone} · {zone.label}
          </span>
          <span className="font-mono text-body tabular-nums text-muted">{hours(session.durationMin)}</span>
        </div>

        <p className="max-w-2xl text-body text-text/90">{session.why}</p>

        <AdaptationBanner adaptation={adaptation} />

        <div className="mt-auto flex gap-2.5 pt-1.5">
          {/* ponytail: Button has no size variant yet and `cn` doesn't dedupe conflicting
              Tailwind classes, so we don't fight its default padding here — see PACKAGE ui. */}
          <Button>Start session</Button>
          <Button variant="secondary">Move to another day</Button>
        </div>
      </div>

      <div className="hidden w-px shrink-0 self-stretch bg-white/[0.08] lg:block" aria-hidden />
      <div className="hairline lg:hidden" />

      <div className="flex w-full flex-col gap-4 lg:w-[300px] lg:shrink-0">
        <div className="flex items-center justify-between gap-3">
          <span className="text-label uppercase tracking-widest text-faint">Readiness</span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-label font-semibold text-text">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: cl.dot, boxShadow: `0 0 10px ${cl.dot}` }} aria-hidden />
            {cl.label}
          </span>
        </div>

        <div className="flex items-end gap-3">
          <span className={`text-stat tabular-nums ${VERDICT_TEXT[readiness.band]}`}>
            {readiness.band === 'unknown' ? '—' : score}
          </span>
          <div className="flex flex-col gap-1 pb-1">
            <span className={`text-h2 ${VERDICT_TEXT[readiness.band]}`}>{VERDICT[readiness.band]}</span>
            <span className="font-mono text-label text-faint">of 100 · 60-day baseline</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="relative h-3 overflow-hidden rounded-full bg-white/[0.07]">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${score}%`, background: `linear-gradient(90deg, ${from}, ${to})`, boxShadow: `0 0 16px -3px ${cl.dot}` }}
            />
            <div className="absolute inset-y-0 left-[45%] w-px bg-bg/60" aria-hidden />
            <div className="absolute inset-y-0 left-[65%] w-px bg-bg/60" aria-hidden />
          </div>
          <div className="flex justify-between font-mono text-[10.5px] text-faint">
            <span>0</span>
            <span>ease off · 45</span>
            <span>65 · train</span>
            <span>100</span>
          </div>
        </div>

        <p className="text-body text-muted">{readinessLine}</p>
      </div>
    </Card>
  );
}

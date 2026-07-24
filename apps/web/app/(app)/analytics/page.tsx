import { Card } from '@ironflow/ui';
import { buildAnalyticsView } from '../../../lib/analytics-demo';
import { FormChart } from '../../../components/analytics/FormChart';
import { DistributionCard } from '../../../components/analytics/DistributionCard';
import { DurabilityCard } from '../../../components/analytics/DurabilityCard';

function StatTile({ label, value, sub, tone = 'text-text' }: { label: string; value: string; sub: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-control border border-white/[0.06] bg-white/[0.02] p-4">
      <span className="text-label uppercase tracking-widest text-faint">{label}</span>
      <span className={`text-h1 tabular-nums ${tone}`}>{value}</span>
      <span className="text-label text-muted">{sub}</span>
    </div>
  );
}

export default function AnalyticsPage() {
  const view = buildAnalyticsView();
  const { current } = view;
  const tsb = Math.round(current.tsb);
  const tsbTone = tsb > 5 ? 'text-ok' : tsb < -10 ? 'text-warn' : 'text-accent-bright';
  const tsbSub = tsb > 5 ? 'Fresh' : tsb < -10 ? 'Fatigued' : 'Neutral';

  return (
    <div className="flex animate-fade-rise flex-col gap-7">
      <header className="flex flex-col gap-2">
        <h1 className="text-display text-text">Analytics</h1>
        <p className="max-w-2xl text-body text-muted">
          Your training state — fitness, fatigue and form over the last 12 weeks, how polarised the work has
          been, and whether your fatigue resistance is holding on the long days.
        </p>
      </header>

      <Card raised className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-label uppercase tracking-widest text-faint">Fitness · fatigue · form</span>
          <div className="flex items-center gap-4 text-label text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-full bg-accent-bright" aria-hidden /> CTL fitness
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-full bg-warn" aria-hidden /> ATL fatigue
            </span>
          </div>
        </div>

        <FormChart series={view.series} />

        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Fitness · CTL" value={String(Math.round(current.ctl))} sub={`Peak ${Math.round(view.peakCtl)} this block`} tone="text-accent-bright" />
          <StatTile label="Fatigue · ATL" value={String(Math.round(current.atl))} sub="42/7-day EWMA loads" tone="text-warn" />
          <StatTile label="Form · TSB" value={tsb > 0 ? `+${tsb}` : String(tsb)} sub={`${tsbSub} — a weak signal, one of several`} tone={tsbTone} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <DistributionCard
          actual={view.distribution.actual}
          target={view.distribution.target}
          withinTolerance={view.distribution.withinTolerance}
          moderateDrift={view.distribution.moderateDrift}
        />
        <DurabilityCard
          latestPct={view.durability.latestPct}
          valid={view.durability.valid}
          exceedsTarget={view.durability.exceedsTarget}
          trend={view.durability.trend}
          response={view.durability.response}
        />
      </div>

      <p className="text-label text-faint">
        CTL/ATL/TSB from <code className="font-mono text-muted">fitnessSeries</code>, distribution from
        <code className="font-mono text-muted"> distribution/policy</code>, decoupling from
        <code className="font-mono text-muted"> durability/decoupling</code> — all pure engine (§5.2, §11).
      </p>
    </div>
  );
}

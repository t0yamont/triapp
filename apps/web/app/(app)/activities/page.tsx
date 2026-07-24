import { Card } from '@ironflow/ui';
import {
  ACTIVITIES,
  SPORT_META,
  durationLabel,
  loadsDisagree,
  weekTotals,
  type ActivitySummary,
} from '../../../lib/activities-demo';

function LoadFigures({ a }: { a: ActivitySummary }) {
  const disagree = loadsDisagree(a);
  return (
    <div className="flex items-center gap-2.5">
      <div className="hidden items-center gap-2 font-mono text-[11px] tabular-nums text-muted md:flex">
        <span>TSS {a.tss}</span>
        <span className="text-faint">·</span>
        <span>TRIMP {a.trimp}</span>
        <span className="text-faint">·</span>
        <span>sRPE {a.srpe}</span>
      </div>
      <span className="font-mono text-mono tabular-nums text-text md:hidden">{a.tss}</span>
      {disagree ? (
        <span className="grid h-5 w-5 place-items-center rounded-full bg-warn/15 text-warn" title="The three load models disagree — worth a look">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-3 w-3">
            <path d="M10 6.5v4M10 13.5h.01M10 3 3 16h14L10 3Z" />
          </svg>
        </span>
      ) : (
        <span className="h-5 w-5" aria-hidden />
      )}
    </div>
  );
}

function Row({ a }: { a: ActivitySummary }) {
  const sport = SPORT_META[a.sport];
  return (
    <button type="button" className="flex w-full items-center gap-4 rounded-control px-3 py-3 text-left transition-colors hover:bg-white/[0.04]">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.05]`}>
        <span className={`h-2.5 w-2.5 rounded-full ${sport.dot}`} aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2">
          <span className="truncate text-body font-medium text-text">{a.title}</span>
          {a.status === 'partial' ? <span className="rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn">PARTIAL</span> : null}
        </div>
        <span className="text-label text-faint">
          {a.dayLabel} {a.dateLabel} · {sport.label}
        </span>
      </div>
      <div className="hidden shrink-0 flex-col items-end sm:flex">
        <span className="font-mono text-mono tabular-nums text-muted">{durationLabel(a.durationMin)}</span>
        <span className="font-mono text-label tabular-nums text-faint">{a.distanceKm.toFixed(1)} km</span>
      </div>
      <LoadFigures a={a} />
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-faint">
        <path d="M7.5 5l5 5-5 5" />
      </svg>
    </button>
  );
}

export default function ActivitiesPage() {
  const totals = weekTotals(ACTIVITIES);
  return (
    <div className="flex animate-fade-rise flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-display text-text">Activities</h1>
          <p className="max-w-2xl text-body text-muted">
            Your recent sessions. Each carries all three load models; open one for maps, streams and the
            zone breakdown.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1.5 text-label text-muted">
          <span className="font-mono tabular-nums text-text">{totals.count}</span> sessions
          <span className="text-faint">·</span>
          <span className="font-mono tabular-nums text-text">{totals.hours}h</span>
          <span className="text-faint">·</span>
          <span className="font-mono tabular-nums text-accent-bright">{totals.loadTss}</span> load
        </span>
      </header>

      <Card className="flex flex-col gap-1 p-3">
        {ACTIVITIES.map((a, i) => (
          <div key={a.id}>
            {i > 0 ? <div className="mx-3 h-px bg-white/[0.05]" /> : null}
            <Row a={a} />
          </div>
        ))}
      </Card>

      <p className="text-label text-faint">
        The list renders from stored summaries only — activity streams are never fetched for a list view
        (they load when you open a session). Load figures come from <code className="font-mono text-muted">load/&#123;tss,trimp,srpe&#125;</code>.
      </p>
    </div>
  );
}

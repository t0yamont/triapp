'use client';

import { Card } from '@ironflow/ui';
import { RpeControl } from '../../../components/activities/RpeControl';
import { UploadActivity } from '../../../components/activities/UploadActivity';
import {
  ACTIVITIES,
  SPORT_META,
  durationLabel,
  listTotals,
  type ActivitySummary,
} from '../../../lib/activities-demo';
import { LIST_WINDOW_DAYS, useLiveActivities } from '../../../lib/live-activities';
import { useActivityRatings } from '../../../lib/rate-activity';

/** A load figure, or an em dash — never a zero, which would claim the session was effortless. */
function Figure({ label, value }: { label: string; value: number | null }) {
  return (
    <span className={value === null ? 'text-faint' : undefined}>
      {label} {value === null ? '—' : value}
    </span>
  );
}

function LoadFigures({ a }: { a: ActivitySummary }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="hidden items-center gap-2 font-mono text-[11px] tabular-nums text-muted md:flex">
        <Figure label="TSS" value={a.tss} />
        <span className="text-faint">·</span>
        <Figure label="TRIMP" value={a.trimp} />
        <span className="text-faint">·</span>
        <Figure label="sRPE" value={a.srpe} />
      </div>
      {/* Narrow screens show the measured one — TRIMP — rather than picking between scales. */}
      <span className="font-mono text-mono tabular-nums text-text md:hidden" title="TRIMP">
        {a.trimp ?? '—'}
      </span>
    </div>
  );
}

/**
 * The row is a plain container, not one big button: the RPE control has to sit *outside* the
 * navigation target (a button inside a button is invalid and unreachable by keyboard). The title
 * is the link to the session detail; the chevron is its decoration.
 */
function Row({ a, onRate, saving }: { a: ActivitySummary; onRate: ((rpe: number) => void) | null; saving: boolean }) {
  const sport = SPORT_META[a.sport];
  return (
    <div className="flex w-full items-center gap-4 rounded-control px-3 py-3 transition-colors hover:bg-white/[0.04]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/[0.05]">
        <span className={`h-2.5 w-2.5 rounded-full ${sport.dot}`} aria-hidden />
      </span>
      <button type="button" className="flex min-w-0 flex-1 flex-col items-start text-left">
        <div className="flex items-center gap-2">
          <span className="truncate text-body font-medium text-text">{a.title}</span>
          {a.status === 'partial' ? <span className="rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn">PARTIAL</span> : null}
          {a.status === 'unplanned' ? (
            <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-faint" title="Ingested, but it didn't match a scheduled session">
              UNPLANNED
            </span>
          ) : null}
        </div>
        <span className="text-label text-faint">
          {a.dayLabel} {a.dateLabel} · {sport.label}
        </span>
      </button>
      <div className="hidden shrink-0 flex-col items-end sm:flex">
        <span className="font-mono text-mono tabular-nums text-muted">{durationLabel(a.durationMin)}</span>
        <span className="font-mono text-label tabular-nums text-faint">
          {a.distanceKm === null ? '—' : `${a.distanceKm.toFixed(1)} km`}
        </span>
      </div>
      <LoadFigures a={a} />
      {onRate ? <RpeControl onRate={onRate} saving={saving} /> : null}
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-faint" aria-hidden>
        <path d="M7.5 5l5 5-5 5" />
      </svg>
    </div>
  );
}

export default function ActivitiesPage() {
  // The athlete's own uploads when there are any; the sample list otherwise.
  const { live, loading } = useLiveActivities();
  // One hook for the whole list — see `rate-activity.ts` on why it isn't per row.
  const ratings = useActivityRatings();
  // A just-written sRPE shows immediately; only real rows can be rated, and only unrated ones.
  const items = (live ?? ACTIVITIES).map((a) => ({ ...a, srpe: ratings.srpeOf(a.id) ?? a.srpe }));
  const totals = listTotals(items);

  return (
    <div className="flex animate-fade-rise flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-display text-text">Activities</h1>
          <p className="max-w-2xl text-body text-muted">
            Your recent sessions. Each carries every load model that can be computed for it; open one for
            maps, streams and the zone breakdown.
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1.5 text-label text-muted">
          <span className="font-mono tabular-nums text-text">{totals.count}</span> sessions
          <span className="text-faint">·</span>
          <span className="font-mono tabular-nums text-text">{totals.hours}h</span>
          {totals.trimp !== null ? (
            <>
              <span className="text-faint">·</span>
              <span className="font-mono tabular-nums text-accent-bright">{totals.trimp}</span> TRIMP
            </>
          ) : null}
        </span>
      </header>

      <UploadActivity />

      <Card className="flex flex-col gap-1 p-3">
        {items.map((a, i) => (
          <div key={a.id}>
            {i > 0 ? <div className="mx-3 h-px bg-white/[0.05]" /> : null}
            <Row
              a={a}
              onRate={live && a.srpe === null ? (rpe) => void ratings.rate(a.id, rpe) : null}
              saving={ratings.savingId === a.id}
            />
          </div>
        ))}
      </Card>

      {ratings.error ? <p className="text-label text-risk">{ratings.error}</p> : null}

      <p className="text-label text-faint">
        {live
          ? `Your own activities from the last ${LIST_WINDOW_DAYS} days. `
          : loading
            ? 'Loading your activities — showing a sample meanwhile. '
            : 'Sample sessions — upload a file above and your own will appear here. '}
        The list renders from stored summaries only; activity streams are never fetched for a list view
        (they load when you open a session). TRIMP is measured from your heart-rate stream at ingest
        (<code className="font-mono text-muted">load/trimp</code>) and sRPE from your own rating —
        rate the session <em>as a whole</em>, not its hardest interval. TSS needs a threshold test, so it
        reads <span className="font-mono">—</span> until you do one.
      </p>
    </div>
  );
}

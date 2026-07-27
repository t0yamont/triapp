'use client';

/**
 * Activity detail — the roadmap's Phase 4 "activity detail with overlay charts and lazy streams".
 *
 * The list page's own comment has said "the title is the link to the session detail" since it was
 * written; there was no detail route, so it linked nowhere.
 *
 * **Lazy** is the important word (CLAUDE.md hard rule 6). The header renders from the activity row
 * alone; the streams — the large part — are fetched afterwards, only here, and never by the list.
 */

import { downsample, getActivity, getActivityStreams, type ActivityStreams } from '@ironflow/api-client';
import { Card } from '@ironflow/ui';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { StreamChart } from '../../../../components/activities/StreamChart';
import { durationLabel } from '../../../../lib/activities-demo';
import { useSupabase } from '../../../../lib/supabase';

/** Matches the list's labels — one vocabulary for a sport across both screens. */
const SPORT_LABEL: Record<string, string> = { run: 'Run', bike: 'Ride', swim: 'Swim', brick: 'Brick', strength: 'Strength', other: 'Session' };

type Activity = Awaited<ReturnType<typeof getActivity>>;

function Stat({ label, value, unit }: { label: string; value: string | number | null; unit?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-label uppercase tracking-widest text-faint">{label}</span>
      <span className="font-mono text-h2 tabular-nums text-text">
        {value === null ? <span className="text-faint">—</span> : value}
        {value !== null && unit ? <span className="ml-1 text-label text-faint">{unit}</span> : null}
      </span>
    </div>
  );
}

const round = (v: number | null, dp = 0): number | null => (v === null ? null : Number(v.toFixed(dp)));

export default function ActivityDetailPage() {
  const supabase = useSupabase();
  const { id } = useParams<{ id: string }>();
  const [activity, setActivity] = useState<Activity>(null);
  const [streams, setStreams] = useState<ActivityStreams | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    if (!supabase || !id) return;
    let alive = true;
    void (async () => {
      const row = await getActivity(supabase, id);
      if (!alive) return;
      setActivity(row);
      setState(row ? 'ready' : 'missing');
      // Only now, and only if there is anything to draw.
      if (row?.has_streams) setStreams(await getActivityStreams(supabase, id));
    })();
    return () => {
      alive = false;
    };
  }, [supabase, id]);

  if (state === 'loading') return <p className="text-body text-faint">Loading session…</p>;
  if (state === 'missing' || !activity) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body text-muted">That session isn’t there — it may have been deleted, or merged into a duplicate.</p>
        <Link href="/activities" className="text-label text-accent underline underline-offset-4">
          Back to activities
        </Link>
      </div>
    );
  }

  const durationMin = Math.round(activity.duration_s / 60);
  const distanceKm = activity.distance_m === null ? null : Number(activity.distance_m) / 1000;
  const speedSeries = streams?.speedMps.length ? downsample(streams.speedMps).map((v) => v * 3.6) : [];

  return (
    <div className="flex animate-fade-rise flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href="/activities" className="text-label text-faint hover:text-muted">
          ← Activities
        </Link>
        {/* Activities carry no name of their own; the planned session's title is on the row it
            was linked to, and the list derives the same fallback. */}
        <h1 className="text-display text-text">
          {SPORT_LABEL[activity.sport] ?? activity.sport}
          {activity.sub_sport ? <span className="text-muted"> · {activity.sub_sport}</span> : null}
        </h1>
        <p className="text-body text-muted">
          {new Date(activity.start_time).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' })}
        </p>
      </header>

      <Card className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Duration" value={durationLabel(durationMin)} />
        <Stat label="Distance" value={distanceKm === null ? null : distanceKm.toFixed(2)} unit="km" />
        <Stat label="Avg HR" value={activity.avg_hr} unit="bpm" />
        <Stat label="Avg power" value={round(activity.avg_power_w)} unit="W" />
        <Stat label="Elevation" value={round(activity.elevation_gain_m)} unit="m" />
        {/* The measured one first — TRIMP is computed from the athlete's own zones (§5.1). */}
        <Stat label="TRIMP" value={round(activity.internal_load)} />
      </Card>

      {activity.decoupling_pct !== null && (
        <Card className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-label uppercase tracking-widest text-faint">Decoupling</span>
          <span className="font-mono text-h2 tabular-nums text-text">{Number(activity.decoupling_pct).toFixed(1)}%</span>
          <span className="text-label text-muted">
            {/* §11: the number only means anything on a long, steady, aerobic effort. */}
            {activity.decoupling_valid ? 'Aerobic durability — second half against the first.' : 'Not a valid durability effort; shown for reference only.'}
          </span>
        </Card>
      )}

      <Card className="flex flex-col gap-4">
        <span className="text-label uppercase tracking-widest text-faint">Trace</span>
        {activity.has_streams ? (
          streams ? (
            <StreamChart
              series={[
                { label: 'Altitude', values: streams.altitudeM.length ? downsample(streams.altitudeM) : [], colour: '#8891A8', unit: 'm', area: true },
                { label: 'Heart rate', values: streams.hr.length ? downsample(streams.hr) : [], colour: '#F4746B', unit: 'bpm' },
                { label: 'Power', values: streams.powerW.length ? downsample(streams.powerW) : [], colour: '#6D8BFF', unit: 'W' },
                { label: 'Speed', values: speedSeries, colour: '#34E0C8', unit: 'km/h' },
              ]}
            />
          ) : (
            <p className="text-label text-faint">Loading trace…</p>
          )
        ) : (
          <p className="text-label text-faint">No sensor trace was recorded for this session.</p>
        )}
      </Card>
    </div>
  );
}

'use client';

/**
 * SyncHealthCard — the sync health dashboard (02-ARCHITECTURE.md §8).
 *
 * "Per-provider success rate, median latency, backlog depth", plus the alerts §8 defines, so an
 * athlete whose Garmin has quietly stopped importing can see that rather than concluding the
 * plan is wrong. The thresholds are in `@ironflow/api-client`; this only renders them.
 *
 * There is no writer for `sync_log` yet — the provider sync lands with the Garmin client — so
 * this legitimately shows "no syncs recorded yet" until then. That is the honest state, and
 * better than a chart of numbers nobody produced.
 */

import { evaluateSyncAlerts, getSyncRuns, summariseSyncHealth, type Alert, type SyncHealth } from '@ironflow/api-client';
import { Card } from '@ironflow/ui';
import { useEffect, useState } from 'react';
import { useSupabase } from '../../lib/supabase';

/** Long enough to be informative on a dashboard; the alert rules use their own 1-hour window. */
const DASHBOARD_WINDOW_HOURS = 24;
const ALERT_WINDOW_HOURS = 1;

const PROVIDER_LABEL: Record<string, string> = {
  garmin: 'Garmin Connect',
  strava: 'Strava',
  apple_health: 'Apple Health',
  wahoo: 'Wahoo',
  polar: 'Polar',
  suunto: 'Suunto',
  manual: 'Manual entry',
  fit_upload: 'FIT upload',
};

const latency = (ms: number | null): string => (ms === null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

export function SyncHealthCard() {
  const supabase = useSupabase();
  const [health, setHealth] = useState<SyncHealth | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void (async () => {
      try {
        const now = Date.now();
        const windowStart = new Date(now - DASHBOARD_WINDOW_HOURS * 3_600_000).toISOString();
        const windowEnd = new Date(now).toISOString();
        const runs = await getSyncRuns(supabase, windowStart);
        if (!alive) return;
        setHealth(summariseSyncHealth(runs, windowStart, windowEnd));

        // Alerts are defined over the last hour, so they get their own slice of the same rows.
        const alertStart = new Date(now - ALERT_WINDOW_HOURS * 3_600_000).toISOString();
        const recent = runs.filter((r) => r.started_at >= alertStart);
        setAlerts(evaluateSyncAlerts(summariseSyncHealth(recent, alertStart, windowEnd), recent));
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'Sync health unavailable.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-widest text-faint">Sync health</span>
        <span className="text-body text-muted">
          Last {DASHBOARD_WINDOW_HOURS} hours. A provider that stops importing should be visible here, not inferred
          from a plan that stopped making sense.
        </span>
      </div>

      {alerts.map((alert) => (
        <div
          key={alert.code}
          className={`rounded-control border px-4 py-3 text-label ${
            alert.severity === 'critical' ? 'border-risk/40 bg-risk/[0.08] text-risk' : 'border-warn/40 bg-warn/[0.08] text-warn'
          }`}
        >
          {alert.message}
        </div>
      ))}

      {error && <p className="text-label text-risk">{error}</p>}

      {health && health.providers.length > 0 ? (
        <div className="flex flex-col gap-2">
          {health.providers.map((p) => {
            const ok = p.failures === 0;
            return (
              <div
                key={p.provider}
                className="flex items-center justify-between gap-4 rounded-control border border-white/[0.06] bg-white/[0.02] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`h-2 w-2 rounded-full ${ok ? 'bg-ok shadow-[0_0_8px_rgba(53,214,164,0.7)]' : 'bg-risk'}`}
                    aria-hidden
                  />
                  <div className="flex flex-col">
                    <span className="text-body text-text">{PROVIDER_LABEL[p.provider] ?? p.provider}</span>
                    <span className="text-label text-faint">
                      {p.runs} run{p.runs === 1 ? '' : 's'}
                      {p.unfinished > 0 ? ` · ${p.unfinished} unfinished` : ''}
                    </span>
                  </div>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="font-mono text-body tabular-nums text-muted">{latency(p.medianLatencyMs)}</span>
                  <span className={`font-mono text-h2 tabular-nums ${ok ? 'text-text' : 'text-risk'}`}>
                    {((1 - p.failureRate) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        !error && <p className="text-label text-faint">No syncs recorded yet.</p>
      )}
    </Card>
  );
}

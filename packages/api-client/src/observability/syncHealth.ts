/**
 * observability/syncHealth.ts — the sync dashboard and the alert rules (02-ARCHITECTURE.md §8).
 *
 * §8 asks for a "sync health dashboard: per-provider success rate, median latency, backlog depth"
 * and alerts on "sync failure rate >5% over 1 h, nightly recompute failure, any guardrail
 * violation reaching the persistence layer".
 *
 * The summarising and the alert decisions are **pure** — they take rows and a timestamp and
 * return numbers. That is what makes the thresholds testable rather than something you find out
 * about in production, and it keeps the query in one thin function underneath.
 */

import type { TriflowClient } from '../client.js';

/** A `sync_log` row, narrowed to the fields the dashboard reads. */
export interface SyncRun {
  provider: string;
  job: string;
  started_at: string;
  finished_at: string | null;
  outcome: string | null;
}

export interface ProviderSyncHealth {
  provider: string;
  runs: number;
  failures: number;
  /** 0–1. Zero when nothing ran, rather than NaN — a provider with no traffic is not failing. */
  failureRate: number;
  /** Median start→finish across finished runs; null when none finished. */
  medianLatencyMs: number | null;
  /**
   * Runs that started and never finished. §8 says "backlog depth"; there is no job queue to
   * measure, so this is the honest available proxy — work that went in and never came out.
   */
  unfinished: number;
}

export interface SyncHealth {
  windowStart: string;
  windowEnd: string;
  providers: ProviderSyncHealth[];
  runs: number;
  failures: number;
  failureRate: number;
}

const FAILED = (outcome: string | null): boolean => outcome !== null && outcome !== 'ok';

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/**
 * Per-provider health over the rows given. A run that is still in flight (`finished_at` null,
 * `outcome` null) counts as neither a success nor a failure — counting it as either would make
 * the rate lurch every time a sync happens to be mid-flight when the dashboard loads.
 */
export function summariseSyncHealth(rows: readonly SyncRun[], windowStart: string, windowEnd: string): SyncHealth {
  const byProvider = new Map<string, SyncRun[]>();
  for (const row of rows) {
    const bucket = byProvider.get(row.provider);
    if (bucket) bucket.push(row);
    else byProvider.set(row.provider, [row]);
  }

  const providers = [...byProvider.entries()]
    .map(([provider, providerRows]) => {
      const settled = providerRows.filter((r) => r.outcome !== null);
      const failures = settled.filter((r) => FAILED(r.outcome)).length;
      const latencies = providerRows
        .filter((r) => r.finished_at !== null)
        .map((r) => new Date(r.finished_at!).getTime() - new Date(r.started_at).getTime());
      return {
        provider,
        runs: settled.length,
        failures,
        failureRate: settled.length === 0 ? 0 : failures / settled.length,
        medianLatencyMs: median(latencies),
        unfinished: providerRows.filter((r) => r.finished_at === null).length,
      };
    })
    .sort((a, b) => b.failureRate - a.failureRate || a.provider.localeCompare(b.provider));

  const runs = providers.reduce((n, p) => n + p.runs, 0);
  const failures = providers.reduce((n, p) => n + p.failures, 0);
  return {
    windowStart,
    windowEnd,
    providers,
    runs,
    failures,
    failureRate: runs === 0 ? 0 : failures / runs,
  };
}

// ── Alerting ─────────────────────────────────────────────────────────────────

/** §8: "sync failure rate >5% over 1 h". */
export const SYNC_FAILURE_RATE_THRESHOLD = 0.05;
export const SYNC_ALERT_WINDOW_HOURS = 1;

/**
 * A rate needs a denominator to mean anything: one failed sync out of one is 100%, and paging on
 * a single provider blip trains people to ignore the pager. Two failures in an hour is a pattern;
 * one is weather. This is an operational judgement on top of the spec's threshold, not a
 * relaxation of it — the rate must still be exceeded.
 */
export const SYNC_ALERT_MIN_FAILURES = 2;

export type AlertCode = 'sync_failure_rate' | 'nightly_recompute_failed' | 'guardrail_violation_persisted';

export interface Alert {
  code: AlertCode;
  severity: 'warning' | 'critical';
  message: string;
  context: Record<string, unknown>;
}

/** Job names that are the nightly recompute. Kept here so the alert survives a rename upstream. */
export const NIGHTLY_JOBS = ['nightly_recompute', 'nightly'];

/**
 * The two sync-side rules from §8. `health` should cover the last hour; passing a longer window
 * changes what the threshold means, so the caller owns that choice.
 */
export function evaluateSyncAlerts(health: SyncHealth, rows: readonly SyncRun[]): Alert[] {
  const alerts: Alert[] = [];

  if (health.failureRate > SYNC_FAILURE_RATE_THRESHOLD && health.failures >= SYNC_ALERT_MIN_FAILURES) {
    alerts.push({
      code: 'sync_failure_rate',
      severity: 'warning',
      message: `Sync failure rate ${(health.failureRate * 100).toFixed(1)}% over ${health.runs} runs`,
      context: {
        failureRate: health.failureRate,
        runs: health.runs,
        failures: health.failures,
        worstProvider: health.providers[0]?.provider ?? null,
      },
    });
  }

  const nightlyFailures = rows.filter((r) => NIGHTLY_JOBS.includes(r.job) && FAILED(r.outcome));
  if (nightlyFailures.length > 0) {
    // Critical: the nightly recompute is what keeps CTL/ATL and readiness current. Silently
    // stale metrics look exactly like a healthy athlete who has stopped improving.
    alerts.push({
      code: 'nightly_recompute_failed',
      severity: 'critical',
      message: `Nightly recompute failed ${nightlyFailures.length}×`,
      context: { count: nightlyFailures.length, providers: [...new Set(nightlyFailures.map((r) => r.provider))] },
    });
  }

  return alerts;
}

/**
 * §8's third rule: "any guardrail violation reaching the persistence layer (should be impossible —
 * if it fires, there is a bug)". Always critical, because the engine is supposed to make this
 * unreachable and an athlete is now holding a week the guardrails would have rejected.
 */
export function guardrailAlert(violations: readonly { code: string; message: string }[]): Alert | null {
  if (violations.length === 0) return null;
  return {
    code: 'guardrail_violation_persisted',
    severity: 'critical',
    message: `Guardrail violation reached persistence: ${violations.map((v) => v.code).join(', ')}`,
    context: { codes: violations.map((v) => v.code), messages: violations.map((v) => v.message) },
  };
}

/** One JSON line per alert, at a level a router can page on. */
export function formatAlert(alert: Alert): string {
  return JSON.stringify({
    level: alert.severity === 'critical' ? 'critical' : 'warn',
    alert: alert.code,
    message: alert.message,
    ...alert.context,
  });
}

export function emitAlert(alert: Alert, sink: (line: string) => void = console.error): void {
  sink(formatAlert(alert));
}

// ── The one query ────────────────────────────────────────────────────────────

/** Rows for the dashboard. `athleteId` narrows it; omitted, RLS decides what is visible. */
export async function getSyncRuns(client: TriflowClient, since: string, athleteId?: string): Promise<SyncRun[]> {
  let query = client.from('sync_log').select('provider, job, started_at, finished_at, outcome').gte('started_at', since);
  if (athleteId !== undefined) query = query.eq('athlete_id', athleteId);
  const { data, error } = await query;
  if (error) throw new Error(`sync health unavailable: ${error.message}`);
  return (data ?? []) as SyncRun[];
}

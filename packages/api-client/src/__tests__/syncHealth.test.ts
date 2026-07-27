import { describe, expect, it } from 'vitest';
import {
  evaluateSyncAlerts,
  guardrailAlert,
  summariseSyncHealth,
  SYNC_ALERT_MIN_FAILURES,
  SYNC_FAILURE_RATE_THRESHOLD,
  type SyncRun,
} from '../observability/syncHealth.js';

const WINDOW_START = '2026-07-27T09:00:00.000Z';
const WINDOW_END = '2026-07-27T10:00:00.000Z';

const run = (over: Partial<SyncRun> = {}): SyncRun => ({
  provider: 'garmin',
  job: 'incremental',
  started_at: '2026-07-27T09:00:00.000Z',
  finished_at: '2026-07-27T09:00:02.000Z',
  outcome: 'ok',
  ...over,
});

const summarise = (rows: SyncRun[]) => summariseSyncHealth(rows, WINDOW_START, WINDOW_END);

describe('summariseSyncHealth', () => {
  it('reports success rate and median latency per provider', () => {
    const health = summarise([
      run({ provider: 'garmin', finished_at: '2026-07-27T09:00:01.000Z' }),
      run({ provider: 'garmin', finished_at: '2026-07-27T09:00:03.000Z' }),
      run({ provider: 'garmin', finished_at: '2026-07-27T09:00:05.000Z' }),
      run({ provider: 'strava', outcome: 'error', finished_at: '2026-07-27T09:00:10.000Z' }),
    ]);

    const garmin = health.providers.find((p) => p.provider === 'garmin')!;
    expect(garmin).toMatchObject({ runs: 3, failures: 0, failureRate: 0, medianLatencyMs: 3000 });
    expect(health.providers.find((p) => p.provider === 'strava')).toMatchObject({ failures: 1, failureRate: 1 });
    expect(health.failureRate).toBeCloseTo(0.25);
  });

  it('averages the middle pair for an even number of runs', () => {
    const health = summarise([
      run({ finished_at: '2026-07-27T09:00:02.000Z' }),
      run({ finished_at: '2026-07-27T09:00:04.000Z' }),
    ]);
    expect(health.providers[0]!.medianLatencyMs).toBe(3000);
  });

  // Otherwise the dashboard's failure rate jumps around purely because a sync happened to be
  // running when someone loaded the page.
  it('excludes an in-flight run from the rate but counts it as unfinished', () => {
    const health = summarise([run(), run({ finished_at: null, outcome: null })]);
    expect(health.providers[0]).toMatchObject({ runs: 1, failures: 0, unfinished: 1 });
  });

  it('reports zero, not NaN, for a provider that has not run', () => {
    const health = summarise([run({ finished_at: null, outcome: null })]);
    expect(health.providers[0]!.failureRate).toBe(0);
    expect(health.failureRate).toBe(0);
  });

  it('handles an empty window', () => {
    const health = summarise([]);
    expect(health).toMatchObject({ providers: [], runs: 0, failures: 0, failureRate: 0 });
    expect(health.windowStart).toBe(WINDOW_START);
  });

  it('sorts the worst provider first — that is what the dashboard is for', () => {
    const health = summarise([
      run({ provider: 'strava' }),
      run({ provider: 'wahoo', outcome: 'error' }),
      run({ provider: 'garmin', outcome: 'timeout' }),
      run({ provider: 'garmin' }),
    ]);
    expect(health.providers.map((p) => p.provider)).toEqual(['wahoo', 'garmin', 'strava']);
  });

  it('counts any non-ok outcome as a failure, whatever it is called', () => {
    const health = summarise([run({ outcome: 'partial' }), run({ outcome: 'ok' })]);
    expect(health.failures).toBe(1);
  });

  it('has no median latency when nothing finished', () => {
    expect(summarise([run({ finished_at: null, outcome: null })]).providers[0]!.medianLatencyMs).toBeNull();
  });
});

describe('evaluateSyncAlerts', () => {
  it('is quiet on a healthy hour', () => {
    const rows = [run(), run(), run()];
    expect(evaluateSyncAlerts(summarise(rows), rows)).toEqual([]);
  });

  it('fires above 5% once the failures are a pattern rather than a blip', () => {
    const rows = [run({ outcome: 'error' }), run({ outcome: 'error' }), ...Array.from({ length: 18 }, () => run())];
    const alerts = evaluateSyncAlerts(summarise(rows), rows);
    expect(alerts.map((a) => a.code)).toEqual(['sync_failure_rate']);
    expect(alerts[0]!.context['failureRate']).toBeGreaterThan(SYNC_FAILURE_RATE_THRESHOLD);
  });

  // One failure out of one is a 100% rate. Paging on that teaches people to ignore the pager.
  it('stays quiet for a single failure even though the rate is 100%', () => {
    const rows = [run({ outcome: 'error' })];
    expect(evaluateSyncAlerts(summarise(rows), rows)).toEqual([]);
    expect(SYNC_ALERT_MIN_FAILURES).toBe(2);
  });

  it('stays quiet when failures are within the threshold', () => {
    const rows = [run({ outcome: 'error' }), run({ outcome: 'error' }), ...Array.from({ length: 98 }, () => run())];
    // 2/100 = 2%, under 5%, even though there are two of them.
    expect(evaluateSyncAlerts(summarise(rows), rows)).toEqual([]);
  });

  it('treats a failed nightly recompute as critical on its own', () => {
    const rows = [run({ job: 'nightly_recompute', outcome: 'error' })];
    const alerts = evaluateSyncAlerts(summarise(rows), rows);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ code: 'nightly_recompute_failed', severity: 'critical' });
  });

  it('can raise both rules at once', () => {
    const rows = [
      run({ job: 'nightly_recompute', outcome: 'error' }),
      run({ outcome: 'error' }),
      ...Array.from({ length: 5 }, () => run()),
    ];
    expect(evaluateSyncAlerts(summarise(rows), rows).map((a) => a.code)).toEqual([
      'sync_failure_rate',
      'nightly_recompute_failed',
    ]);
  });
});

describe('guardrailAlert', () => {
  it('says nothing when the engine did its job', () => {
    expect(guardrailAlert([])).toBeNull();
  });

  // "Should be impossible — if it fires, there is a bug" (§8). An athlete is now holding a week
  // the guardrails would have rejected, so there is no lower severity than critical.
  it('is always critical and names the codes', () => {
    const alert = guardrailAlert([
      { code: 'G6_S3_FRACTION', message: 'S3 12% of weekly time' },
      { code: 'G4_RECOVERY_CUT', message: 'recovery week not cut' },
    ])!;
    expect(alert.severity).toBe('critical');
    expect(alert.context['codes']).toEqual(['G6_S3_FRACTION', 'G4_RECOVERY_CUT']);
    expect(alert.message).toContain('G6_S3_FRACTION');
  });
});

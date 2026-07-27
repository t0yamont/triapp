import { describe, expect, it } from 'vitest';
import { formatJobLog, withJobLog, type JobOutcome } from '../observability/log.js';

/** A sink plus a clock that advances by a fixed step on each read. */
function harness(stepMs = 25) {
  const lines: { line: string; outcome: JobOutcome }[] = [];
  let t = 1_000;
  return {
    lines,
    sink: (line: string, outcome: JobOutcome) => lines.push({ line, outcome }),
    now: () => {
      const v = t;
      t += stepMs;
      return v;
    },
    parsed: () => lines.map((l) => JSON.parse(l.line) as Record<string, unknown>),
  };
}

describe('formatJobLog', () => {
  it('emits one queryable JSON object with the four §8 fields', () => {
    const entry = JSON.parse(formatJobLog({ job: 'sync.garmin', athleteId: 'a1', durationMs: 812, outcome: 'ok' }));
    expect(entry).toEqual({ level: 'info', job: 'sync.garmin', athleteId: 'a1', durationMs: 812, outcome: 'ok' });
  });

  it('raises the level on failure so alerting can key off it', () => {
    const entry = JSON.parse(formatJobLog({ job: 'nightly', durationMs: 3, outcome: 'error', error: 'boom' }));
    expect(entry['level']).toBe('error');
  });
});

describe('withJobLog', () => {
  it('logs one line with the elapsed time and returns the result', async () => {
    const h = harness(25);
    const result = await withJobLog({ job: 'sync.strava', athleteId: 'a1', sink: h.sink, now: h.now }, async () => 42);

    expect(result).toBe(42);
    expect(h.parsed()).toEqual([
      { level: 'info', job: 'sync.strava', athleteId: 'a1', durationMs: 25, outcome: 'ok' },
    ]);
  });

  it('carries job-specific fields through', async () => {
    const h = harness();
    await withJobLog({ job: 'ingest', fields: { provider: 'garmin', activities: 3 }, sink: h.sink, now: h.now }, async () => null);
    expect(h.parsed()[0]).toMatchObject({ provider: 'garmin', activities: 3 });
    expect(h.parsed()[0]).not.toHaveProperty('athleteId');
  });

  // A swallowed error is a failed job that reads as a success — the one failure mode that makes
  // the whole dashboard lie.
  it('logs the failure and rethrows', async () => {
    const h = harness();
    await expect(
      withJobLog({ job: 'account.erase', athleteId: 'a1', sink: h.sink, now: h.now }, async () => {
        throw new Error('FK violation');
      }),
    ).rejects.toThrow('FK violation');

    expect(h.lines[0]!.outcome).toBe('error');
    expect(h.parsed()[0]).toMatchObject({ outcome: 'error', error: 'FK violation', durationMs: 25 });
  });

  it('records a non-Error throw without losing the line', async () => {
    const h = harness();
    await expect(withJobLog({ job: 'j', sink: h.sink, now: h.now }, async () => Promise.reject('nope'))).rejects.toBe(
      'nope',
    );
    expect(h.parsed()[0]).toMatchObject({ outcome: 'error', error: 'nope' });
  });
});

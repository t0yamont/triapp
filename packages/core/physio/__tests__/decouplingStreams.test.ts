import { describe, expect, it } from 'vitest';
import { DECOUPLING_MIN_SESSION_MIN } from '../constants.js';
import { decouplingFromStreams, type DecouplingStreams } from '../durability/streams.js';

/** A steady session: `n` samples at 1 Hz, HR and power given per index. */
const ride = (n: number, hr: (i: number) => number, pw: (i: number) => number): DecouplingStreams => ({
  timeS: Array.from({ length: n }, (_, i) => i),
  hr: Array.from({ length: n }, (_, i) => hr(i)),
  powerW: Array.from({ length: n }, (_, i) => pw(i)),
});

const LONG = Math.ceil(DECOUPLING_MIN_SESSION_MIN * 60) + 120; // comfortably over the 75-min gate
const opts = { sport: 'bike' as const, ambientRecorded: true };

describe('decouplingFromStreams', () => {
  it('returns null without HR — nothing to decouple', () => {
    expect(decouplingFromStreams({ powerW: [200, 200, 200, 200] }, opts)).toBeNull();
  });

  it('returns null when the sport has no comparable intensity stream', () => {
    const s = ride(LONG, () => 140, () => 200);
    expect(decouplingFromStreams(s, { ...opts, sport: 'swim' })).toBeNull();
    expect(decouplingFromStreams(s, { ...opts, sport: 'strength' })).toBeNull();
  });

  it('uses speed on foot and power on the bike', () => {
    const n = LONG;
    const run: DecouplingStreams = {
      timeS: Array.from({ length: n }, (_, i) => i),
      hr: Array.from({ length: n }, () => 150),
      speedMps: Array.from({ length: n }, () => 3.3),
    };
    expect(decouplingFromStreams(run, { ...opts, sport: 'run' })).not.toBeNull();
    // ...and a run with only power (no speed) can't be read.
    expect(decouplingFromStreams({ ...run, speedMps: undefined, powerW: [1, 2, 3, 4] }, { ...opts, sport: 'run' })).toBeNull();
  });

  it('reports ~0% drift for a perfectly steady effort', () => {
    const result = decouplingFromStreams(ride(LONG, () => 145, () => 210), opts)!;
    expect(result.decouplingPct).toBeCloseTo(0, 1);
    expect(result.valid).toBe(true);
  });

  it('detects positive drift when HR climbs at the same power', () => {
    // Second half at a higher HR for identical power ⇒ ratio rises ⇒ positive decoupling.
    const result = decouplingFromStreams(ride(LONG, (i) => (i < LONG / 2 ? 140 : 154), () => 200), opts)!;
    expect(result.decouplingPct).toBeGreaterThan(5);
    expect(result.exceedsTarget).toBe(true);
  });

  it('detects negative drift when power rises at the same HR', () => {
    const result = decouplingFromStreams(ride(LONG, () => 150, (i) => (i < LONG / 2 ? 200 : 220)), opts)!;
    expect(result.decouplingPct).toBeLessThan(0);
  });

  it('marks a short session invalid but still returns the number', () => {
    const result = decouplingFromStreams(ride(600, () => 150, () => 200), opts)!;
    expect(result.valid).toBe(false);
    expect(result.invalidReasons).toContain('TOO_SHORT');
    expect(Number.isFinite(result.decouplingPct)).toBe(true); // computed, just not trusted
  });

  it('invalidates an unsteady effort', () => {
    const result = decouplingFromStreams(ride(LONG, () => 150, (i) => (i % 2 === 0 ? 80 : 320)), opts)!;
    expect(result.invalidReasons).toContain('UNSTEADY_INTENSITY');
  });

  it('invalidates when ambient conditions were not recorded', () => {
    const result = decouplingFromStreams(ride(LONG, () => 145, () => 210), { ...opts, ambientRecorded: false })!;
    expect(result.invalidReasons).toContain('NO_AMBIENT');
  });

  it('flags a long stop from a gap in the recorded time series', () => {
    const s = ride(LONG, () => 145, () => 210);
    // Push everything after the midpoint 10 minutes later — a break, not a traffic light.
    s.timeS = s.timeS!.map((t, i) => (i > LONG / 2 ? t + 600 : t));
    expect(decouplingFromStreams(s, opts)!.invalidReasons).toContain('LONG_STOP');
  });

  it('ignores a brief pause that is not a stop', () => {
    const s = ride(LONG, () => 145, () => 210);
    s.timeS = s.timeS!.map((t, i) => (i > LONG / 2 ? t + 30 : t));
    expect(decouplingFromStreams(s, opts)!.invalidReasons).not.toContain('LONG_STOP');
  });

  it('excludes stopped samples so coasting does not fake a drift', () => {
    // Zero-power samples in the second half would drag its mean intensity down and inflate
    // the ratio if counted. Dropping them keeps the reading about actual work.
    const withCoasting = ride(LONG, () => 145, (i) => (i > LONG / 2 && i % 3 === 0 ? 0 : 210));
    const result = decouplingFromStreams(withCoasting, opts)!;
    expect(result.decouplingPct).toBeCloseTo(0, 1);
  });

  it('returns null when there are too few usable samples', () => {
    expect(decouplingFromStreams(ride(3, () => 150, () => 200), opts)).toBeNull();
    expect(decouplingFromStreams(ride(20, () => 150, () => 0), opts)).toBeNull(); // never moving
  });
});

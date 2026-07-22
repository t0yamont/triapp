import { describe, expect, it } from 'vitest';
import f4 from '../../../../supabase/seed/fixtures/F4-dfa-a1.json' with { type: 'json' };
import {
  aggregateDfaSingles,
  computeWindowAlpha,
  correctArtefacts,
  detectThresholdsFromWindows,
  dfaAlpha1,
  type DfaWindow,
} from '../anchors/dfaAlpha1.js';
import type { Estimate, ThresholdPoint } from '../types.js';

// Deterministic PRNG (mulberry32) + Box–Muller, so the synthetic RR signals are stable.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussians(n: number, seed: number): number[] {
  const rnd = mulberry32(seed);
  const out: number[] = [];
  while (out.length < n) {
    const u1 = Math.max(rnd(), 1e-12);
    const u2 = rnd();
    const mag = Math.sqrt(-2 * Math.log(u1));
    out.push(mag * Math.cos(2 * Math.PI * u2));
    out.push(mag * Math.sin(2 * Math.PI * u2));
  }
  return out.slice(0, n);
}

describe('DFA-a1 primitive (§6.1)', () => {
  it('recovers α1 ≈ 0.5 for white noise', () => {
    // Uncorrelated RR (white noise) — the canonical α1 ≈ 0.5 case.
    const rr = gaussians(2048, 12345).map((g) => 800 + g * 25);
    const alpha = dfaAlpha1(rr);
    expect(Math.abs(alpha - f4.expected.dfaWhiteNoiseAlpha)).toBeLessThan(0.15);
  });

  it('recovers α1 ≈ 1.5 for a random walk (Brownian)', () => {
    // Integrated white noise (random walk) — the canonical α1 ≈ 1.5 case.
    const inc = gaussians(2048, 999);
    let acc = 0;
    const rr = inc.map((g) => {
      acc += g;
      return 800 + acc * 2;
    });
    const alpha = dfaAlpha1(rr);
    expect(Math.abs(alpha - f4.expected.dfaBrownianAlpha)).toBeLessThan(0.2);
  });

  it('throws when given too few beats', () => {
    expect(() => dfaAlpha1([800, 810, 790])).toThrow();
  });

  it('returns NaN for a perfectly constant (zero-fluctuation) series', () => {
    expect(dfaAlpha1(new Array(40).fill(800))).toBeNaN();
  });
});

describe('Artefact correction (§6.1)', () => {
  const clean = Array.from({ length: 120 }, (_, i) => 800 + ((i * 7) % 11));

  it('leaves a clean series untouched', () => {
    const { correctedFraction } = correctArtefacts(clean);
    expect(correctedFraction).toBe(0);
    expect(computeWindowAlpha(clean).rejected).toBe(false);
  });

  it('handles an empty series without dividing by zero', () => {
    const { corrected, correctedFraction } = correctArtefacts([]);
    expect(corrected).toEqual([]);
    expect(correctedFraction).toBe(0);
  });

  it('F4 negative — a series with 8% artefacts is rejected, no anchor produced', () => {
    const dirty = [...clean];
    // Inject spikes at 8% of beats (every ~12th), each a clear ectopic outlier.
    let injected = 0;
    for (let i = 5; i < dirty.length && injected < Math.round(0.08 * dirty.length); i += 12) {
      dirty[i] = 1600;
      injected++;
    }
    const { correctedFraction } = correctArtefacts(dirty);
    expect(correctedFraction * 100).toBeGreaterThan(f4.expected.artefactRejectPct); // > 5%
    expect(correctedFraction * 100).toBeCloseTo(f4.expected.negativeArtefactPct, 0); // ≈ 8%
    expect(computeWindowAlpha(dirty).rejected).toBe(true);
    expect(computeWindowAlpha(dirty).alpha1).toBeNaN();
  });
});

describe('Threshold detection from windows (§6.1)', () => {
  // A slow ramp: α1 declines linearly 1.05 → 0.30, crossing 0.75 at window 6 and 0.50 at
  // window 11. HR and power rise linearly, so the interpolated crossings are exact.
  function ramp(count = 16): DfaWindow[] {
    return Array.from({ length: count }, (_, i) => ({
      timeS: i * 30, // 30 s step → 16 windows span 450 s (> 4 min)
      alpha1: 1.05 - i * 0.05,
      hr: 120 + i * 3,
      intensity: 200 + i * 10, // watts
      intensitySteady: true,
    }));
  }

  it('F4 — detects LT1 at α1=0.75 and LT2 at α1=0.50, provenance dfa_a1_single (0.50)', () => {
    const { lt1, lt2 } = detectThresholdsFromWindows(ramp(), 'power', '2026-06-01T00:00:00Z');
    expect(lt1).toBeDefined();
    expect(lt2).toBeDefined();
    expect(lt1!.provenance).toBe(f4.expected.singleProvenance);
    expect(lt1!.confidence).toBe(f4.expected.singleConfidence);
    expect(lt1!.value.hr).toBeCloseTo(138, 6); // window 6: 120 + 6·3
    expect(lt1!.value.power).toBeCloseTo(260, 6); // window 6: 200 + 6·10
    expect(lt2!.value.hr).toBeCloseTo(153, 6); // window 11: 120 + 11·3
    expect(lt2!.value.power).toBeCloseTo(310, 6);
    expect(lt1!.value.hr).toBeLessThan(lt2!.value.hr); // LT1 below LT2
  });

  it('stores pace (m/s) rather than power for run modality', () => {
    const { lt1 } = detectThresholdsFromWindows(ramp(), 'speed', '2026-06-01T00:00:00Z');
    expect(lt1!.value.pace).toBeCloseTo(260, 6);
    expect(lt1!.value.power).toBeUndefined();
  });

  it('rejects a crossing not spanned by ≥4 min of declining α1', () => {
    // 5 windows, 30 s apart → 120 s span; crosses 0.75 but too briefly.
    const short: DfaWindow[] = [0.85, 0.8, 0.75, 0.7, 0.65].map((a, i) => ({
      timeS: i * 30,
      alpha1: a,
      hr: 130 + i,
      intensity: 250 + i * 5,
      intensitySteady: true,
    }));
    const { lt1 } = detectThresholdsFromWindows(short, 'power', '2026-06-01T00:00:00Z');
    expect(lt1).toBeUndefined();
  });

  it('ignores non-steady windows', () => {
    const windows = ramp().map((w, i) => (i === 6 ? { ...w, intensitySteady: false } : w));
    // Window 6 (the exact 0.75 point) is dropped; detection now interpolates between
    // windows 5 and 7, still producing a valid LT1 between their HRs.
    const { lt1 } = detectThresholdsFromWindows(windows, 'power', '2026-06-01T00:00:00Z');
    expect(lt1!.value.hr).toBeGreaterThan(135);
    expect(lt1!.value.hr).toBeLessThan(141);
  });
});

describe('Aggregation single → multi (§6.1)', () => {
  const NOW = '2026-06-21T00:00:00Z';
  function single(hr: number, measuredAt: string): Estimate<ThresholdPoint> {
    return { value: { hr, power: 250 }, confidence: 0.5, provenance: 'dfa_a1_single', measuredAt };
  }

  it('F4 — three sessions within 21 days spanning ≤6 bpm upgrade to dfa_a1_multi (0.75, median)', () => {
    const singles = [
      single(140, '2026-06-05T00:00:00Z'),
      single(143, '2026-06-12T00:00:00Z'),
      single(145, '2026-06-18T00:00:00Z'),
    ];
    const multi = aggregateDfaSingles(singles, NOW)!;
    expect(multi.provenance).toBe(f4.expected.multiProvenance);
    expect(multi.confidence).toBe(f4.expected.multiConfidence);
    expect(multi.value.hr).toBe(143); // median of 140/143/145
    expect(multi.sampleSize).toBe(3);
  });

  it('does not aggregate fewer than three sessions', () => {
    expect(aggregateDfaSingles([single(140, '2026-06-10T00:00:00Z')], NOW)).toBeUndefined();
  });

  it('does not aggregate when HR spread exceeds 6 bpm', () => {
    const singles = [
      single(138, '2026-06-05T00:00:00Z'),
      single(143, '2026-06-12T00:00:00Z'),
      single(147, '2026-06-18T00:00:00Z'), // spread 9 bpm
    ];
    expect(aggregateDfaSingles(singles, NOW)).toBeUndefined();
  });

  it('excludes sessions older than 21 days from the window', () => {
    const singles = [
      single(140, '2026-04-01T00:00:00Z'), // stale
      single(143, '2026-06-12T00:00:00Z'),
      single(145, '2026-06-18T00:00:00Z'),
    ];
    expect(aggregateDfaSingles(singles, NOW)).toBeUndefined(); // only 2 recent
  });

  it('aggregates pace-based singles by median (run modality)', () => {
    const paceSingle = (hr: number, pace: number, measuredAt: string): Estimate<ThresholdPoint> => ({
      value: { hr, pace },
      confidence: 0.5,
      provenance: 'dfa_a1_single',
      measuredAt,
    });
    const multi = aggregateDfaSingles(
      [
        paceSingle(150, 3.8, '2026-06-05T00:00:00Z'),
        paceSingle(152, 3.9, '2026-06-12T00:00:00Z'),
        paceSingle(153, 4.0, '2026-06-18T00:00:00Z'),
      ],
      NOW,
    )!;
    expect(multi.value.pace).toBe(3.9); // median pace
    expect(multi.value.power).toBeUndefined();
    expect(multi.value.hr).toBe(152);
  });
});

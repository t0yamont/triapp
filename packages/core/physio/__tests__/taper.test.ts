import { describe, expect, it } from 'vitest';
import f7 from '../../../../supabase/seed/fixtures/F7-taper-ironman.json' with { type: 'json' };
import { TAPER_TABLE } from '../constants.js';
import { generateTaper } from '../plan/taper.js';
import type { EventType } from '../plan/types.js';

describe('Taper generation (§8.3)', () => {
  it('F7 — Ironman 18-day taper decays to the final-week band, retaining intensity', () => {
    const { taperDays, weeks } = generateTaper({
      eventType: f7.input.eventType as EventType,
      preTaperLoad: f7.input.preTaperLoad,
      preTaperSessionCount: f7.input.preTaperSessionCount,
    });
    expect(taperDays).toBe(f7.expected.taperDays); // 18
    expect(weeks).toHaveLength(f7.expected.numWeeks); // 3

    const final = weeks[2]!;
    const [finalLo, finalHi] = f7.expected.finalLoadRange as [number, number];
    expect(final.load).toBeGreaterThanOrEqual(finalLo); // 280
    expect(final.load).toBeLessThanOrEqual(finalHi); // 413

    // I8 — final-week volume in [40%, 60%] of pre-taper.
    const frac = final.load / f7.input.preTaperLoad;
    expect(frac).toBeGreaterThanOrEqual(0.4);
    expect(frac).toBeLessThanOrEqual(0.6);

    // Progressive (decreasing) volume across the taper.
    expect(weeks[0]!.load).toBeGreaterThan(weeks[1]!.load);
    expect(weeks[1]!.load).toBeGreaterThan(weeks[2]!.load);

    // I9 — every taper week retains ≥1 S3, frequency within 1 of pre-taper.
    for (const w of weeks) {
      expect(w.hasS3Session).toBe(true);
      expect(w.hasRacePaceSession).toBe(true);
      expect(Math.abs(w.sessionCount - f7.input.preTaperSessionCount)).toBeLessThanOrEqual(1);
    }

    // Final 48 h activation; only the last week is the race week.
    expect(final.hasActivationSession).toBe(true);
    expect(final.isRaceWeek).toBe(true);
    expect(weeks[0]!.isRaceWeek).toBe(false);
    expect(weeks[0]!.hasActivationSession).toBe(false);
  });

  it('I8/I9 hold for every A-race event', () => {
    for (const eventType of Object.keys(TAPER_TABLE) as EventType[]) {
      const { taperDays, weeks } = generateTaper({ eventType, preTaperLoad: 600, preTaperSessionCount: 7 });
      expect(taperDays).toBe(TAPER_TABLE[eventType].days);
      expect(weeks.length).toBe(Math.ceil(taperDays / 7));
      const final = weeks[weeks.length - 1]!;
      const frac = final.load / 600;
      expect(frac).toBeGreaterThanOrEqual(0.4); // I8
      expect(frac).toBeLessThanOrEqual(0.6);
      expect(weeks.every((w) => w.hasS3Session)).toBe(true); // I9
      expect(final.isRaceWeek).toBe(true);
    }
  });

  it('produces a single week for a 7-day sprint taper', () => {
    const { weeks } = generateTaper({ eventType: 'sprint_tri', preTaperLoad: 400, preTaperSessionCount: 6 });
    expect(weeks).toHaveLength(1);
    expect(weeks[0]!.isRaceWeek).toBe(true);
    expect(weeks[0]!.load).toBe(200); // 50% reduction → 40–60% band → 0.50 × 400
  });
});

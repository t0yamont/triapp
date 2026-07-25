import type { AdaptationAction, SZone } from '@ironflow/core/physio';
import { describe, expect, it } from 'vitest';
import { adaptedZone } from '../repositories/wellness.js';

const ZONES: SZone[] = ['S1', 'S2', 'S3'];

describe('adaptedZone', () => {
  it('eases an S3 session to S2 on the one-day rule', () => {
    expect(adaptedZone('downgrade_s3_to_s2', 'S3')).toBe('S2');
  });

  it('drops to S1 on the harder rules', () => {
    expect(adaptedZone('reduce_to_s1_or_rest', 'S3')).toBe('S1');
    expect(adaptedZone('reduce_to_s1_or_rest', 'S2')).toBe('S1');
    expect(adaptedZone('convert_week_to_recovery', 'S2')).toBe('S1');
  });

  it('leaves the session alone when there is no action', () => {
    for (const zone of ZONES) expect(adaptedZone('none', zone)).toBeNull();
  });

  it('never raises intensity — the I12/I14 downgrade-only invariant', () => {
    const actions: AdaptationAction[] = [
      'none',
      'downgrade_s3_to_s2',
      'reduce_to_s1_or_rest',
      'convert_week_to_recovery',
    ];
    const rank: Record<SZone, number> = { S1: 1, S2: 2, S3: 3 };
    for (const action of actions) {
      for (const current of ZONES) {
        const next = adaptedZone(action, current);
        if (next !== null) expect(rank[next]).toBeLessThan(rank[current]);
      }
    }
  });

  it('is a no-op when the session is already at or below the target', () => {
    // An S1 day can't be eased further, and S3→S2 does nothing to an S2 day.
    expect(adaptedZone('downgrade_s3_to_s2', 'S2')).toBeNull();
    expect(adaptedZone('downgrade_s3_to_s2', 'S1')).toBeNull();
    expect(adaptedZone('reduce_to_s1_or_rest', 'S1')).toBeNull();
  });
});

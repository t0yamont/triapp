import type { ParsedActivity } from '@ironflow/core/ingest';
import { describe, expect, it } from 'vitest';
import { readPublicEnv, readServiceEnv } from '../env.js';
import { ingestRequestSchema } from '../schemas.js';
import { packInt16, toByteaHex } from '../streams.js';
import { toActivityRow, toLapRows, toStreamRow } from '../repositories/activities.js';

const parsed: ParsedActivity = {
  sport: 'bike',
  startTime: '2026-07-01T06:00:00.000Z',
  localTzOffsetMin: 60,
  durationS: 3600.4,
  distanceM: 30000,
  avgHr: 140,
  avgPowerW: 210,
  hrSource: 'chest_strap',
  provider: 'fit_upload',
  providerActivityId: '12345-abc',
  hasRrIntervals: true,
  hasStreams: true,
  laps: [{ lapIndex: 0, startOffsetS: 0, durationS: 1800.6, distanceM: 15000, avgHr: 138.7 }],
  streams: { timeS: [0, 1, 2], hr: [140, 142, 145], rrIntervalsMs: [810, 800], sampleRateHz: 1 },
};

describe('activity row mappers', () => {
  it('maps a ParsedActivity to an activities Insert row', () => {
    const row = toActivityRow('athlete-1', parsed);
    expect(row.athlete_id).toBe('athlete-1');
    expect(row.sport).toBe('bike');
    expect(row.duration_s).toBe(3600); // integer column → rounded
    expect(row.primary_provider).toBe('fit_upload');
    expect(row.has_rr_intervals).toBe(true);
    expect(row.hr_source).toBe('chest_strap');
    expect(row.provider_activity_id).toBe('12345-abc');
  });

  it('maps laps, rounding integer columns', () => {
    const rows = toLapRows('act-1', parsed);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ activity_id: 'act-1', lap_index: 0, duration_s: 1801, avg_hr: 139 });
  });

  it('packs present streams to hex bytea and records the codec', () => {
    const row = toStreamRow('act-1', parsed.streams);
    expect(row.activity_id).toBe('act-1');
    expect(row.compression).toBe('none');
    expect(row.hr).toBe(toByteaHex(packInt16([140, 142, 145])));
    expect(row.rr_intervals).toBe(toByteaHex(packInt16([810, 800])));
    expect(row.power_w).toBeNull(); // absent stream → null
  });
});

describe('streams packing', () => {
  it('toByteaHex prefixes \\x and pads bytes', () => {
    expect(toByteaHex(new Uint8Array([0, 15, 255]))).toBe('\\x000fff');
  });
  it('packs Int16 little-endian', () => {
    expect(toByteaHex(packInt16([1, 258]))).toBe('\\x01000201');
  });
});

describe('env validation', () => {
  it('parses valid public env', () => {
    const env = readPublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://abc.supabase.co');
  });
  it('rejects a non-URL supabase url', () => {
    expect(() => readPublicEnv({ NEXT_PUBLIC_SUPABASE_URL: 'nope', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'a' })).toThrow();
  });
  it('reads the service-role key server-side', () => {
    expect(readServiceEnv({ SUPABASE_SERVICE_ROLE_KEY: 'svc' }).SUPABASE_SERVICE_ROLE_KEY).toBe('svc');
  });
});

describe('ingest request schema', () => {
  it('defaults provider to fit_upload', () => {
    const r = ingestRequestSchema.parse({ athleteId: '00000000-0000-0000-0000-000000000001' });
    expect(r.provider).toBe('fit_upload');
  });
  it('rejects a non-uuid athleteId', () => {
    expect(() => ingestRequestSchema.parse({ athleteId: 'x' })).toThrow();
  });
});

import type { ParsedActivity } from '@ironflow/core/ingest';
import { buildAthleteModel, buildZones } from '@ironflow/core/physio';
import { describe, expect, it } from 'vitest';
import { readPublicEnv, readServiceEnv } from '../env.js';
import { ingestRequestSchema, zoneSetSchema } from '../schemas.js';
import { packInt16, toByteaHex } from '../streams.js';
import { pacePer100m, toSportAnchors } from '../repositories/fieldTests.js';
import {
  perceivedLoadFor,
  toActivityLoad,
  toActivityRow,
  toSwimTss,
  toLapRows,
  toStreamRow,
} from '../repositories/activities.js';

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

describe('time-in-zone and TRIMP at ingest', () => {
  const NOW = '2026-07-26T07:00:00.000Z';
  const { model } = buildAthleteModel({
    hrMax: { athleteReported: { value: 190, measuredAt: NOW }, now: NOW },
    hrRest: { morningReadings: [50], now: NOW },
    now: NOW,
  })!;
  const zoneSet = buildZones(model, 'bike');
  const [z1, , , , z5] = zoneSet.zones;
  const withHr = (hr: number[], timeS?: number[]): ParsedActivity => ({
    ...parsed,
    streams: timeS ? { hr, timeS } : { hr },
  });

  it('bins the HR stream into the S-zones and weights them into internal_load', () => {
    const easy = Math.floor((z1!.lower.bpm + z1!.upper.bpm) / 2);
    // 120 easy samples at 1 Hz ⇒ 2 minutes of S1 ⇒ TRIMP 2 × weight 1.
    const load = toActivityLoad(withHr(Array.from({ length: 120 }, () => easy)), zoneSet);
    expect(load.time_in_s1_s).toBe(120);
    expect(load.time_in_s2_s).toBe(0);
    expect(load.time_in_s3_s).toBe(0);
    expect(load.internal_load).toBeCloseTo(2);
  });

  it('costs more per minute for harder work (S3 weight > S1 weight)', () => {
    const easy = Math.floor((z1!.lower.bpm + z1!.upper.bpm) / 2);
    const hard = z5!.lower.bpm + 1;
    const n = 600;
    const easyLoad = toActivityLoad(withHr(Array.from({ length: n }, () => easy)), zoneSet).internal_load!;
    const hardLoad = toActivityLoad(withHr(Array.from({ length: n }, () => hard)), zoneSet).internal_load!;
    expect(hardLoad).toBeGreaterThan(easyLoad);
  });

  it('honours the sample time series rather than assuming 1 Hz', () => {
    const easy = Math.floor((z1!.lower.bpm + z1!.upper.bpm) / 2);
    // 5 s apart ⇒ 5 + 5 + 1 (final sample assumed) = 11 s, not 3.
    expect(toActivityLoad(withHr([easy, easy, easy], [0, 5, 10]), zoneSet).time_in_s1_s).toBe(11);
  });

  it('stays null without a zone set — never a guessed zone system', () => {
    const easy = Math.floor((z1!.lower.bpm + z1!.upper.bpm) / 2);
    expect(toActivityLoad(withHr([easy, easy]), null)).toEqual({
      internal_load: null,
      time_in_s1_s: null,
      time_in_s2_s: null,
      time_in_s3_s: null,
    });
  });

  it('stays null without an HR stream', () => {
    expect(toActivityLoad({ ...parsed, streams: {} }, zoneSet).internal_load).toBeNull();
  });

  it('is written onto the activity row', () => {
    const easy = Math.floor((z1!.lower.bpm + z1!.upper.bpm) / 2);
    const row = toActivityRow('athlete-1', withHr([easy, easy, easy]), zoneSet);
    expect(row.time_in_s1_s).toBe(3);
    expect(row.internal_load).toBeGreaterThan(0);
    expect(toActivityRow('athlete-1', parsed).internal_load).toBeNull(); // no zone set passed
  });

  it('accepts a persisted zone set and rejects a corrupt one', () => {
    expect(zoneSetSchema.safeParse(JSON.parse(JSON.stringify(zoneSet))).success).toBe(true);
    expect(zoneSetSchema.safeParse({ ...zoneSet, zones: [] }).success).toBe(false);
    expect(zoneSetSchema.safeParse({ ...zoneSet, hrMax: null }).success).toBe(false);
  });
});

describe('perceivedLoadFor', () => {
  it('is RPE × whole minutes (§5.1, Foster)', () => {
    expect(perceivedLoadFor(7, 3600)).toBe(420); // 7 × 60 min
    expect(perceivedLoadFor(4, 2700)).toBe(180); // 4 × 45 min
  });

  it('rejects a fractional RPE — the column is a smallint and the two would drift apart', () => {
    expect(() => perceivedLoadFor(6.5, 3600)).toThrow(/whole number/);
  });

  it('rejects 0, which on the CR10 scale means rest, and anything above 10', () => {
    expect(() => perceivedLoadFor(0, 3600)).toThrow();
    expect(() => perceivedLoadFor(11, 3600)).toThrow();
    expect(() => perceivedLoadFor(-1, 3600)).toThrow();
  });

  it('accepts both ends of the scale', () => {
    expect(perceivedLoadFor(1, 3600)).toBe(60);
    expect(perceivedLoadFor(10, 3600)).toBe(600);
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

describe('swim TSS, unlocked by a recorded CSS test', () => {
  const swim = (over: Partial<ParsedActivity> = {}): ParsedActivity => ({
    ...parsed,
    sport: 'swim',
    distanceM: 1500,
    durationS: 1500, // 1.0 m/s
    ...over,
  });

  it('scores a swim once CSS exists', () => {
    const tss = toSwimTss(swim(), 1.0)!;
    expect(tss).toBeGreaterThan(0);
    // Swimming exactly at CSS ⇒ IF 1.0 ⇒ tss = duration/3600 × 100.
    expect(tss).toBeCloseTo((1500 / 3600) * 100, 5);
  });

  it('stays null until a test has been recorded', () => {
    expect(toSwimTss(swim(), null)).toBeNull();
    expect(toActivityRow('a', swim()).external_load).toBeNull();
  });

  it('never scores a non-swim, which needs CP or threshold pace instead', () => {
    expect(toSwimTss({ ...parsed, sport: 'bike' }, 1.0)).toBeNull();
  });

  it('needs a distance and a duration to have a speed at all', () => {
    expect(toSwimTss(swim({ distanceM: undefined }), 1.0)).toBeNull();
    expect(toSwimTss(swim({ durationS: 0, movingTimeS: 0 }), 1.0)).toBeNull();
  });

  it('prefers moving time over elapsed — rest at the wall is not swimming', () => {
    const withRest = swim({ durationS: 3000, movingTimeS: 1500 });
    expect(toSwimTss(withRest, 1.0)).toBeCloseTo(toSwimTss(swim(), 1.0)!, 5);
  });

  it('rejects a nonsensical CSS rather than dividing by it', () => {
    expect(toSwimTss(swim(), 0)).toBeNull();
    expect(toSwimTss(swim(), -1)).toBeNull();
  });
});

describe('toSportAnchors — stored anchors → the model’s sports map', () => {
  const row = (over: Record<string, unknown> = {}) =>
    ({
      id: 'a1',
      athlete_id: 'ath-1',
      sport: 'swim',
      anchor_type: 'css',
      value_numeric: '1.15',
      value_json: null,
      unit: 'm/s',
      confidence: '0.65',
      provenance: 'css_test',
      sample_size: 2,
      source_activity_ids: null,
      measured_at: '2026-07-26T09:00:00.000Z',
      superseded_at: null,
      created_at: '2026-07-26T09:00:00.000Z',
      ...over,
    }) as never;

  it('maps a CSS anchor onto the sport’s criticalIntensity (§6.3)', () => {
    const sports = toSportAnchors([row()]);
    expect(sports.swim?.criticalIntensity).toEqual({
      value: 1.15, // numeric arrives as a string from Postgres
      confidence: 0.65,
      provenance: 'css_test',
      measuredAt: '2026-07-26T09:00:00.000Z',
    });
  });

  it('keeps the newest anchor when several exist for one sport', () => {
    const sports = toSportAnchors([row({ value_numeric: '1.30' }), row({ value_numeric: '1.10' })]);
    expect(sports.swim?.criticalIntensity?.value).toBe(1.3); // rows arrive newest first
  });

  it('treats CP and CS as the same concept, per sport', () => {
    const sports = toSportAnchors([
      row({ sport: 'bike', anchor_type: 'critical_power', value_numeric: '265', unit: 'W' }),
    ]);
    expect(sports.bike?.criticalIntensity?.value).toBe(265);
  });

  it('ignores anchors that are not a critical intensity, or have no value', () => {
    expect(toSportAnchors([row({ anchor_type: 'hr_max', sport: null })])).toEqual({});
    expect(toSportAnchors([row({ value_numeric: null })])).toEqual({});
  });
});

describe('pacePer100m', () => {
  it('converts a speed into the pace a swim set is written in', () => {
    expect(pacePer100m(1.0)).toBe(100); // 1 m/s ⇒ 1:40 per 100 m
    expect(pacePer100m(1.25)).toBe(80); // ⇒ 1:20
  });
});

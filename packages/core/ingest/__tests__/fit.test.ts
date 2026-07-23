import { describe, expect, it } from 'vitest';
import { fitCrc } from '../parse/fit-crc.js';
import { parseFit } from '../parse/fit.js';
import { parseActivityFile } from '../parse/index.js';

const FIT_EPOCH = 631065600;
const START_ISO = '2026-07-01T06:00:00.000Z';
const startUnix = Date.parse(START_ISO) / 1000;
const fitTs = startUnix - FIT_EPOCH;

const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];

/** Build a minimal but valid FIT file: file_id, records (hr/power/speed), hrv (RR), lap, session. */
function encodeFit(): Uint8Array {
  const body: number[] = [];
  const p = (...b: number[]) => body.push(...b);

  // def0 file_id (global 0): time_created(4,u32), serial(3,u32z)
  p(0x40, 0, 0, ...u16(0), 2, 4, 4, 0x86, 3, 4, 0x8c);
  p(0x00, ...u32(fitTs), ...u32(12345));

  // def2 record (global 20): timestamp(253,u32), hr(3,u8), power(7,u16), speed(6,u16 scale1000)
  p(0x42, 0, 0, ...u16(20), 4, 253, 4, 0x86, 3, 1, 0x02, 7, 2, 0x84, 6, 2, 0x84);
  const recs: [number, number, number, number][] = [
    [fitTs, 140, 200, 8000],
    [fitTs + 1, 142, 210, 8100],
    [fitTs + 2, 145, 205, 8050],
  ];
  for (const [ts, hr, pw, sp] of recs) p(0x02, ...u32(ts), hr, ...u16(pw), ...u16(sp));

  // def3 hrv (global 78): time(0,u16 array of 2, scale1000) → RR ms [810, 800]
  p(0x43, 0, 0, ...u16(78), 1, 0, 4, 0x84);
  p(0x03, ...u16(810), ...u16(800));

  // def4 lap (global 19): start_time(2,u32), total_elapsed(7,u32 scale1000), total_distance(9,u32 scale100), avg_hr(15,u8)
  p(0x44, 0, 0, ...u16(19), 4, 2, 4, 0x86, 7, 4, 0x86, 9, 4, 0x86, 15, 1, 0x02);
  p(0x04, ...u32(fitTs), ...u32(3600000), ...u32(3000000), 142);

  // def1 session (global 18): sport(5,enum), start_time(2,u32), total_elapsed(7), total_distance(9), avg_hr(16,u8)
  p(0x41, 0, 0, ...u16(18), 5, 5, 1, 0x00, 2, 4, 0x86, 7, 4, 0x86, 9, 4, 0x86, 16, 1, 0x02);
  p(0x01, 2, ...u32(fitTs), ...u32(3600000), ...u32(3000000), 140);

  const header = [12, 0x10, ...u16(2108), ...u32(body.length), 0x2e, 0x46, 0x49, 0x54];
  const all = new Uint8Array(header.length + body.length + 2);
  all.set(header, 0);
  all.set(body, header.length);
  const crc = fitCrc(all, 0, header.length + body.length);
  all[all.length - 2] = crc & 0xff;
  all[all.length - 1] = (crc >> 8) & 0xff;
  return all;
}

describe('FIT decoder (§6.1, CLAUDE §7)', () => {
  const fit = encodeFit();

  it('decodes sport, start time, and session summary', () => {
    const a = parseFit(fit);
    expect(a.sport).toBe('bike'); // FIT sport 2 → bike
    expect(a.startTime).toBe(START_ISO);
    expect(a.durationS).toBe(3600); // total_elapsed 3600000/1000
    expect(a.distanceM).toBe(30000); // total_distance 3000000/100
    expect(a.avgHr).toBe(140);
    expect(a.provider).toBe('fit_upload');
    expect(a.providerActivityId).toMatch(/^12345-/);
  });

  it('decodes per-sample streams', () => {
    const a = parseFit(fit);
    expect(a.streams.timeS).toEqual([0, 1, 2]);
    expect(a.streams.hr).toEqual([140, 142, 145]);
    expect(a.streams.powerW).toEqual([200, 210, 205]);
    expect(a.streams.speedMps).toEqual([8, 8.1, 8.05]);
  });

  it('decodes RR intervals from hrv messages (the DFA-a1 input)', () => {
    const a = parseFit(fit);
    expect(a.hasRrIntervals).toBe(true);
    expect(a.streams.rrIntervalsMs).toEqual([810, 800]);
  });

  it('decodes laps with offsets relative to activity start', () => {
    const a = parseFit(fit);
    expect(a.laps).toHaveLength(1);
    expect(a.laps[0]!).toMatchObject({ lapIndex: 0, startOffsetS: 0, durationS: 3600, distanceM: 30000, avgHr: 142 });
  });

  it('is detected and finalised through parseActivityFile (hrSource = chest_strap via RR)', () => {
    const a = parseActivityFile(fit);
    expect(a.hasStreams).toBe(true);
    expect(a.hrSource).toBe('chest_strap');
  });

  it('rejects a corrupt file (CRC mismatch)', () => {
    const bad = encodeFit();
    bad[20] = bad[20]! ^ 0xff; // flip a data byte
    expect(() => parseFit(bad)).toThrow(/CRC/);
  });

  it('rejects a non-FIT buffer', () => {
    expect(() => parseFit(new Uint8Array(20))).toThrow(/\.FIT/);
  });
});

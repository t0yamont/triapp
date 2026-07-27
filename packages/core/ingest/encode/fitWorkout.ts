/**
 * encode/fitWorkout.ts — write a planned session as a Garmin-compatible `.FIT` workout file.
 *
 * This is the **fallback that has to exist regardless** (08-ROADMAP.md Phase 7, and the risk
 * table: "Garmin Training API grant refused separately from Health API → FIT workout download
 * fallback, built in Phase 7 regardless"). If the API grant never arrives, or an athlete uses a
 * device the API doesn't reach, they can still download a file and side-load the session.
 *
 * Scope is deliberately narrow: FIT is a large format, and a workout file needs only the
 * `file_id`, `workout` and `workout_step` messages. Everything is written little-endian with
 * one definition message per global message type, which is the simplest legal encoding.
 */

import { fitCrc } from '../parse/fit-crc.js';

// ── FIT wire constants (SDK global message / field numbers) ──────────────────
const GLOBAL_FILE_ID = 0;
const GLOBAL_WORKOUT = 26;
const GLOBAL_WORKOUT_STEP = 27;

const FILE_TYPE_WORKOUT = 5;
const HEADER_SIZE = 14;
const PROTOCOL_VERSION = 0x20; // 2.0
const PROFILE_VERSION = 2140;

/** Base types used here: enum/uint8 (0x00), uint16 (0x84), uint32 (0x86), string (0x07). */
const T_ENUM = 0x00;
const T_UINT8 = 0x02;
const T_UINT16 = 0x84;
const T_UINT32 = 0x86;
const T_STRING = 0x07;

/** workout_step.duration_type / target_type values we emit. */
const DURATION_TIME = 0;
const TARGET_HEART_RATE = 1;
const TARGET_OPEN = 2;

export type FitSport = 'run' | 'bike' | 'swim' | 'other';
/** FIT sport enum values. */
const SPORT_ENUM: Record<FitSport, number> = { run: 1, bike: 2, swim: 5, other: 0 };

export type FitIntensity = 'active' | 'rest' | 'warmup' | 'cooldown';
const INTENSITY_ENUM: Record<FitIntensity, number> = { active: 0, rest: 1, warmup: 2, cooldown: 3 };

export interface FitWorkoutStep {
  /** Shown on the watch. Truncated to 15 chars + NUL, which is the FIT field width used here. */
  name: string;
  durationSec: number;
  intensity: FitIntensity;
  /** Optional HR range in bpm. Omitted → an open step with no target. */
  hrLowBpm?: number;
  hrHighBpm?: number;
}

export interface FitWorkout {
  name: string;
  sport: FitSport;
  steps: FitWorkoutStep[];
}

// ── Byte writer ──────────────────────────────────────────────────────────────

class Writer {
  private bytes: number[] = [];

  u8(v: number): void {
    this.bytes.push(v & 0xff);
  }
  u16(v: number): void {
    this.bytes.push(v & 0xff, (v >> 8) & 0xff);
  }
  u32(v: number): void {
    this.bytes.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff);
  }
  /** Fixed-width, NUL-terminated ASCII. Non-ASCII is dropped rather than mangled on the watch. */
  str(v: string, width: number): void {
    const ascii = [...v].filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127).slice(0, width - 1);
    for (const c of ascii) this.u8(c.charCodeAt(0));
    for (let i = ascii.length; i < width; i++) this.u8(0);
  }
  raw(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

interface FieldDef {
  num: number;
  size: number;
  baseType: number;
}

/** A definition message: tells the reader the shape of the data messages that follow. */
function writeDefinition(w: Writer, localType: number, globalNum: number, fields: FieldDef[]): void {
  w.u8(0x40 | localType); // definition message, no developer fields
  w.u8(0); // reserved
  w.u8(0); // architecture: 0 = little-endian
  w.u16(globalNum);
  w.u8(fields.length);
  for (const f of fields) {
    w.u8(f.num);
    w.u8(f.size);
    w.u8(f.baseType);
  }
}

const NAME_WIDTH = 16;

/**
 * Encode a workout as FIT bytes. The result is a complete file: 14-byte header, records, and
 * the trailing CRC, with the header's own CRC and the data size filled in.
 */
export function encodeFitWorkout(workout: FitWorkout): Uint8Array {
  if (workout.steps.length === 0) throw new Error('a FIT workout needs at least one step');

  const body = new Writer();

  // file_id — every FIT file must open with one.
  writeDefinition(body, 0, GLOBAL_FILE_ID, [
    { num: 0, size: 1, baseType: T_ENUM }, // type
    { num: 1, size: 2, baseType: T_UINT16 }, // manufacturer
    { num: 2, size: 2, baseType: T_UINT16 }, // product
    { num: 4, size: 4, baseType: T_UINT32 }, // time_created
  ]);
  body.u8(0);
  body.u8(FILE_TYPE_WORKOUT);
  body.u16(255); // manufacturer: development
  body.u16(0);
  body.u32(0); // time_created 0 — a workout is not tied to a moment, and the engine has no clock

  // workout
  writeDefinition(body, 1, GLOBAL_WORKOUT, [
    { num: 8, size: NAME_WIDTH, baseType: T_STRING }, // wkt_name
    { num: 4, size: 1, baseType: T_ENUM }, // sport
    { num: 6, size: 2, baseType: T_UINT16 }, // num_valid_steps
  ]);
  body.u8(1);
  body.str(workout.name, NAME_WIDTH);
  body.u8(SPORT_ENUM[workout.sport]);
  body.u16(workout.steps.length);

  // workout_step ×N
  writeDefinition(body, 2, GLOBAL_WORKOUT_STEP, [
    { num: 254, size: 2, baseType: T_UINT16 }, // message_index
    { num: 0, size: NAME_WIDTH, baseType: T_STRING }, // wkt_step_name
    { num: 1, size: 1, baseType: T_ENUM }, // duration_type
    { num: 2, size: 4, baseType: T_UINT32 }, // duration_value (ms)
    { num: 3, size: 1, baseType: T_ENUM }, // target_type
    { num: 4, size: 4, baseType: T_UINT32 }, // target_value
    { num: 5, size: 4, baseType: T_UINT32 }, // custom_target_value_low
    { num: 6, size: 4, baseType: T_UINT32 }, // custom_target_value_high
    { num: 7, size: 1, baseType: T_ENUM }, // intensity
  ]);

  workout.steps.forEach((step, i) => {
    const hasHr = step.hrLowBpm !== undefined && step.hrHighBpm !== undefined;
    body.u8(2);
    body.u16(i);
    body.str(step.name, NAME_WIDTH);
    body.u8(DURATION_TIME);
    body.u32(Math.max(0, Math.round(step.durationSec * 1000)));
    body.u8(hasHr ? TARGET_HEART_RATE : TARGET_OPEN);
    body.u32(0); // target_value 0 ⇒ use the custom low/high pair below
    // FIT encodes a custom HR target as bpm + 100; values below that are read as %max.
    body.u32(hasHr ? step.hrLowBpm! + 100 : 0);
    body.u32(hasHr ? step.hrHighBpm! + 100 : 0);
    body.u8(INTENSITY_ENUM[step.intensity]);
  });

  const data = body.raw();

  const header = new Writer();
  header.u8(HEADER_SIZE);
  header.u8(PROTOCOL_VERSION);
  header.u16(PROFILE_VERSION);
  header.u32(data.length);
  for (const c of '.FIT') header.u8(c.charCodeAt(0));
  const headerNoCrc = header.raw();
  const withHeaderCrc = new Uint8Array(HEADER_SIZE);
  withHeaderCrc.set(headerNoCrc);
  const hCrc = fitCrc(headerNoCrc);
  withHeaderCrc[12] = hCrc & 0xff;
  withHeaderCrc[13] = (hCrc >> 8) & 0xff;

  const out = new Uint8Array(HEADER_SIZE + data.length + 2);
  out.set(withHeaderCrc, 0);
  out.set(data, HEADER_SIZE);
  const fileCrc = fitCrc(out, 0, HEADER_SIZE + data.length);
  out[out.length - 2] = fileCrc & 0xff;
  out[out.length - 1] = (fileCrc >> 8) & 0xff;
  return out;
}

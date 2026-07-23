/**
 * ingest/parse/fit.ts — Garmin FIT binary decoder (03-ALGORITHM §6.1 needs RR; CLAUDE §7:
 * FIT parsing is server-side). Focused on the messages IronFlow uses: file_id, activity,
 * session, lap, record, and hrv (RR intervals).
 *
 * FIT structure: a 12/14-byte header, a stream of definition + data messages, and a trailing
 * CRC. Definition messages declare each local message type's field layout; data messages are
 * decoded against the most recent definition for their local type. See the FIT SDK.
 */

import type { IngestProvider, ParsedActivity, ParsedLap, ParsedStreams } from '../types.js';
import { fitCrc } from './fit-crc.js';
import { mapFitSport } from './sportmap.js';

const FIT_EPOCH_OFFSET_S = 631065600; // seconds between the Unix epoch and the FIT epoch (1989-12-31)
const SEMICIRCLE_TO_DEG = 180 / 2 ** 31;

interface BaseType {
  size: number;
  invalid: number | null;
  read: (v: DataView, o: number, le: boolean) => number;
}

const BASE_TYPES: Record<number, BaseType> = {
  0x00: { size: 1, invalid: 0xff, read: (v, o) => v.getUint8(o) }, // enum
  0x01: { size: 1, invalid: 0x7f, read: (v, o) => v.getInt8(o) }, // sint8
  0x02: { size: 1, invalid: 0xff, read: (v, o) => v.getUint8(o) }, // uint8
  0x03: { size: 2, invalid: 0x7fff, read: (v, o, le) => v.getInt16(o, le) }, // sint16
  0x04: { size: 2, invalid: 0xffff, read: (v, o, le) => v.getUint16(o, le) }, // uint16
  0x05: { size: 4, invalid: 0x7fffffff, read: (v, o, le) => v.getInt32(o, le) }, // sint32
  0x06: { size: 4, invalid: 0xffffffff, read: (v, o, le) => v.getUint32(o, le) >>> 0 }, // uint32
  0x07: { size: 1, invalid: 0x00, read: (v, o) => v.getUint8(o) }, // string (bytes; unused)
  0x08: { size: 4, invalid: null, read: (v, o, le) => v.getFloat32(o, le) }, // float32
  0x09: { size: 8, invalid: null, read: (v, o, le) => v.getFloat64(o, le) }, // float64
  0x0a: { size: 1, invalid: 0x00, read: (v, o) => v.getUint8(o) }, // uint8z
  0x0b: { size: 2, invalid: 0x0000, read: (v, o, le) => v.getUint16(o, le) }, // uint16z
  0x0c: { size: 4, invalid: 0x00000000, read: (v, o, le) => v.getUint32(o, le) >>> 0 }, // uint32z
  0x0d: { size: 1, invalid: 0xff, read: (v, o) => v.getUint8(o) }, // byte
};

interface FieldMeta {
  key: string;
  scale?: number;
  offset?: number;
  semicircles?: boolean;
  isTime?: boolean;
}

// The FIT Profile subset we decode (global message number → field def number → meaning).
const PROFILE: Record<number, Record<number, FieldMeta>> = {
  0: { 1: { key: 'manufacturer' }, 2: { key: 'product' }, 3: { key: 'serial' }, 4: { key: 'timeCreated', isTime: true } },
  34: { 253: { key: 'timestamp' }, 5: { key: 'localTimestamp' } }, // activity — for local tz offset
  18: {
    5: { key: 'sport' }, 6: { key: 'subSport' }, 2: { key: 'startTime', isTime: true },
    7: { key: 'totalElapsed', scale: 1000 }, 9: { key: 'totalDistance', scale: 100 },
    16: { key: 'avgHr' }, 17: { key: 'maxHr' }, 20: { key: 'avgPower' }, 14: { key: 'avgSpeed', scale: 1000 },
    22: { key: 'totalAscent' }, 18: { key: 'avgCadence' },
  },
  19: {
    254: { key: 'messageIndex' }, 2: { key: 'startTime', isTime: true },
    7: { key: 'totalElapsed', scale: 1000 }, 9: { key: 'totalDistance', scale: 100 },
    15: { key: 'avgHr' }, 19: { key: 'avgPower' }, 13: { key: 'avgSpeed', scale: 1000 },
  },
  20: {
    253: { key: 'timestamp', isTime: true }, 0: { key: 'lat', semicircles: true }, 1: { key: 'lng', semicircles: true },
    2: { key: 'altitude', scale: 5, offset: 500 }, 78: { key: 'enhAltitude', scale: 5, offset: 500 },
    3: { key: 'hr' }, 4: { key: 'cadence' }, 5: { key: 'distance', scale: 100 },
    6: { key: 'speed', scale: 1000 }, 73: { key: 'enhSpeed', scale: 1000 }, 7: { key: 'power' }, 13: { key: 'temperature' },
  },
  78: { 0: { key: 'time', scale: 1000 } }, // hrv — array of RR intervals in seconds
};

interface FieldDef {
  num: number;
  size: number;
  baseType: number;
}
interface MessageDef {
  globalNum: number;
  le: boolean;
  fields: FieldDef[];
  devBytes: number;
}

function fitTimeToIso(rawSeconds: number): string {
  return new Date((rawSeconds + FIT_EPOCH_OFFSET_S) * 1000).toISOString();
}

// `viewLE` is a module-level flag set per message from the definition's architecture byte.
let viewLE = true;
/** Read one field's raw value(s); invalid entries become null. Arrays when size > element size. */
function readRawLE(view: DataView, off: number, info: BaseType, size: number): (number | null) | (number | null)[] {
  const count = Math.max(1, Math.floor(size / info.size));
  const readOne = (o: number): number | null => {
    const raw = info.read(view, o, viewLE);
    return info.invalid !== null && raw === info.invalid ? null : raw;
  };
  if (count === 1) return readOne(off);
  const arr: (number | null)[] = [];
  for (let i = 0; i < count; i++) arr.push(readOne(off + i * info.size));
  return arr;
}

function convert(meta: FieldMeta | undefined, raw: number): number | string {
  if (!meta) return raw;
  if (meta.isTime) return fitTimeToIso(raw);
  if (meta.semicircles) return raw * SEMICIRCLE_TO_DEG;
  let v = raw;
  if (meta.scale) v = v / meta.scale;
  if (meta.offset) v = v - meta.offset;
  return v;
}

export function parseFit(input: Uint8Array | ArrayBuffer, provider: IngestProvider = 'fit_upload'): ParsedActivity {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 14) throw new Error('FIT: file too short');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const headerSize = bytes[0]!;
  if (bytes[8] !== 0x2e || bytes[9] !== 0x46 || bytes[10] !== 0x49 || bytes[11] !== 0x54) {
    throw new Error('FIT: missing .FIT signature');
  }
  const dataSize = view.getUint32(4, true);
  const dataEnd = headerSize + dataSize;
  if (dataEnd + 2 > bytes.length) throw new Error('FIT: truncated (data size exceeds file)');

  // Validate the trailing file CRC over header + data.
  const expectedCrc = view.getUint16(dataEnd, true);
  if (fitCrc(bytes, 0, dataEnd) !== expectedCrc) throw new Error('FIT: CRC mismatch (corrupt file)');

  const defs: Record<number, MessageDef> = {};
  let pos = headerSize;

  // Accumulators
  const fileId: Record<string, number | string> = {};
  const session: Record<string, number | string> = {};
  const activityMsg: Record<string, number> = {};
  const laps: ParsedLap[] = [];
  const rrIntervalsMs: number[] = [];
  const rec = {
    tsRaw: [] as number[],
    hr: [] as number[],
    power: [] as number[],
    speed: [] as number[],
    altitude: [] as number[],
    cadence: [] as number[],
    distance: [] as number[],
    temperature: [] as number[],
    latlng: [] as [number, number][],
    present: { hr: false, power: false, speed: false, altitude: false, cadence: false, temperature: false, latlng: false },
  };

  function readDataMessage(def: MessageDef): Map<number, number | (number | null)[]> {
    viewLE = def.le;
    const out = new Map<number, number | (number | null)[]>();
    for (const f of def.fields) {
      const info = BASE_TYPES[f.baseType & 0x1f] ?? BASE_TYPES[0x0d]!;
      const raw = readRawLE(view, pos, info, f.size);
      pos += f.size;
      if (Array.isArray(raw)) out.set(f.num, raw);
      else if (raw !== null) out.set(f.num, raw);
    }
    pos += def.devBytes; // skip developer fields' data
    return out;
  }

  function dispatch(def: MessageDef, msg: Map<number, number | (number | null)[]>): void {
    const p = PROFILE[def.globalNum];
    switch (def.globalNum) {
      case 0:
        if (p) for (const [n, v] of msg) if (typeof v === 'number' && p[n]) fileId[p[n]!.key] = convert(p[n], v);
        break;
      case 34:
        for (const n of [253, 5]) {
          const v = msg.get(n);
          if (typeof v === 'number') activityMsg[p![n]!.key] = v;
        }
        break;
      case 18:
        if (p) for (const [n, v] of msg) if (typeof v === 'number' && p[n]) session[p[n]!.key] = convert(p[n], v);
        break;
      case 19: {
        const g = (n: number): number | undefined => {
          const v = msg.get(n);
          return typeof v === 'number' ? (convert(p![n], v) as number) : undefined;
        };
        const startRaw = msg.get(2);
        laps.push({
          lapIndex: (msg.get(254) as number | undefined) ?? laps.length,
          startOffsetS: typeof startRaw === 'number' ? startRaw : 0, // resolved to offset after startTime is known
          durationS: g(7) ?? 0,
          distanceM: g(9),
          avgHr: g(15),
          avgPowerW: g(19),
          avgSpeedMps: g(13),
        });
        break;
      }
      case 20: {
        const g = (n: number): number | undefined => {
          const v = msg.get(n);
          return typeof v === 'number' ? (convert(p![n], v) as number) : undefined;
        };
        const tsRaw = msg.get(253);
        if (typeof tsRaw === 'number') rec.tsRaw.push(tsRaw);
        const lat = g(0);
        const lng = g(1);
        if (lat !== undefined && lng !== undefined) {
          rec.latlng.push([lat, lng]);
          rec.present.latlng = true;
        }
        const hr = g(3);
        rec.hr.push(hr ?? 0);
        if (hr !== undefined) rec.present.hr = true;
        const power = g(7);
        rec.power.push(power ?? 0);
        if (power !== undefined) rec.present.power = true;
        const speed = g(73) ?? g(6);
        rec.speed.push(speed ?? 0);
        if (speed !== undefined) rec.present.speed = true;
        const alt = g(78) ?? g(2);
        rec.altitude.push(alt ?? 0);
        if (alt !== undefined) rec.present.altitude = true;
        const cad = g(4);
        rec.cadence.push(cad ?? 0);
        if (cad !== undefined) rec.present.cadence = true;
        const temp = g(13);
        rec.temperature.push(temp ?? 0);
        if (temp !== undefined) rec.present.temperature = true;
        break;
      }
      case 78: {
        const arr = msg.get(0);
        if (Array.isArray(arr)) for (const v of arr) if (v !== null) rrIntervalsMs.push(v); // raw ms
        break;
      }
      default:
        break;
    }
  }

  while (pos < dataEnd) {
    const header = bytes[pos++]!;
    if (header & 0x80) {
      // Compressed-timestamp data message: local type in bits 5-6, time offset in bits 0-4.
      const localType = (header >> 5) & 0x03;
      const def = defs[localType];
      if (!def) throw new Error(`FIT: data for undefined local type ${localType}`);
      dispatch(def, readDataMessage(def));
      continue;
    }
    const isDef = (header & 0x40) !== 0;
    const hasDev = (header & 0x20) !== 0;
    const localType = header & 0x0f;
    if (isDef) {
      pos++; // reserved
      const le = bytes[pos++] === 0;
      viewLE = le;
      const globalNum = view.getUint16(pos, le);
      pos += 2;
      const numFields = bytes[pos++]!;
      const fields: FieldDef[] = [];
      for (let i = 0; i < numFields; i++) {
        fields.push({ num: bytes[pos++]!, size: bytes[pos++]!, baseType: bytes[pos++]! });
      }
      let devBytes = 0;
      if (hasDev) {
        const numDev = bytes[pos++]!;
        for (let i = 0; i < numDev; i++) {
          pos++; // field num
          devBytes += bytes[pos++]!; // size
          pos++; // dev data index
        }
      }
      defs[localType] = { globalNum, le, fields, devBytes };
    } else {
      const def = defs[localType];
      if (!def) throw new Error(`FIT: data for undefined local type ${localType}`);
      dispatch(def, readDataMessage(def));
    }
  }

  // ── Assemble the ParsedActivity ────────────────────────────────────────────
  const startIso =
    (session['startTime'] as string | undefined) ??
    (rec.tsRaw.length > 0 ? fitTimeToIso(rec.tsRaw[0]!) : undefined) ??
    (fileId['timeCreated'] as string | undefined) ??
    new Date(0).toISOString();
  const startMs = new Date(startIso).getTime();

  // Lap start_time was stored as raw FIT seconds; resolve it to an offset from activity start.
  for (const lap of laps) {
    const rawStart = lap.startOffsetS;
    lap.startOffsetS = rawStart > 0 ? Math.max(0, (rawStart + FIT_EPOCH_OFFSET_S) * 1000 - startMs) / 1000 : 0;
  }

  const streams: ParsedStreams = { sampleRateHz: 1 };
  if (rec.tsRaw.length > 0) {
    const t0 = rec.tsRaw[0]!;
    streams.timeS = rec.tsRaw.map((t) => t - t0);
  }
  if (rec.present.hr) streams.hr = rec.hr;
  if (rec.present.power) streams.powerW = rec.power;
  if (rec.present.speed) streams.speedMps = rec.speed;
  if (rec.present.altitude) streams.altitudeM = rec.altitude;
  if (rec.present.cadence) streams.cadence = rec.cadence;
  if (rec.present.temperature) streams.temperatureC = rec.temperature;
  if (rec.present.latlng) streams.latlng = rec.latlng;
  if (rrIntervalsMs.length > 0) streams.rrIntervalsMs = rrIntervalsMs;

  const localTzOffsetMin =
    activityMsg['localTimestamp'] !== undefined && activityMsg['timestamp'] !== undefined
      ? Math.round((activityMsg['localTimestamp'] - activityMsg['timestamp']) / 60)
      : 0;

  const serial = fileId['serial'];
  const timeCreatedIso = fileId['timeCreated'] as string | undefined;
  const providerActivityId =
    serial !== undefined ? `${serial}-${timeCreatedIso ?? startIso}` : timeCreatedIso;

  return {
    sport: mapFitSport(session['sport'] as number | undefined),
    startTime: startIso,
    localTzOffsetMin,
    durationS:
      (session['totalElapsed'] as number | undefined) ??
      (rec.tsRaw.length > 1 ? rec.tsRaw[rec.tsRaw.length - 1]! - rec.tsRaw[0]! : 0),
    distanceM: session['totalDistance'] as number | undefined,
    elevationGainM: session['totalAscent'] as number | undefined,
    avgHr: session['avgHr'] as number | undefined,
    maxHr: session['maxHr'] as number | undefined,
    avgPowerW: session['avgPower'] as number | undefined,
    avgSpeedMps: session['avgSpeed'] as number | undefined,
    avgCadence: session['avgCadence'] as number | undefined,
    provider,
    providerActivityId,
    hasRrIntervals: rrIntervalsMs.length > 0,
    hasStreams: false, // finalised by normalizeActivity
    laps,
    streams,
  };
}

import { describe, expect, it } from 'vitest';
import { encodeFitWorkout, type FitWorkout } from '../encode/fitWorkout.js';
import { fitCrc } from '../parse/fit-crc.js';

/**
 * A minimal FIT reader — just enough to walk definition and data messages back out. Reading the
 * file with independent code is the point: it proves the encoder emits something parseable,
 * not merely that it emits bytes.
 */
interface ReadField {
  num: number;
  size: number;
}
interface ReadMessage {
  global: number;
  fields: Map<number, Uint8Array>;
}

function readFit(bytes: Uint8Array): { dataSize: number; messages: ReadMessage[] } {
  const headerSize = bytes[0]!;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dataSize = view.getUint32(4, true);

  const defs = new Map<number, { global: number; fields: ReadField[] }>();
  const messages: ReadMessage[] = [];
  let i = headerSize;
  const end = headerSize + dataSize;

  while (i < end) {
    const recordHeader = bytes[i]!;
    i += 1;
    const localType = recordHeader & 0x0f;

    if (recordHeader & 0x40) {
      i += 1; // reserved
      const architecture = bytes[i]!;
      expect(architecture, 'encoder must write little-endian').toBe(0);
      i += 1;
      const global = view.getUint16(i, true);
      i += 2;
      const count = bytes[i]!;
      i += 1;
      const fields: ReadField[] = [];
      for (let f = 0; f < count; f++) {
        fields.push({ num: bytes[i]!, size: bytes[i + 1]! });
        i += 3; // num, size, baseType
      }
      defs.set(localType, { global, fields });
      continue;
    }

    const def = defs.get(localType);
    expect(def, `data message for undefined local type ${localType}`).toBeDefined();
    const fields = new Map<number, Uint8Array>();
    for (const f of def!.fields) {
      fields.set(f.num, bytes.slice(i, i + f.size));
      i += f.size;
    }
    messages.push({ global: def!.global, fields });
  }

  expect(i, 'records must consume the data section exactly').toBe(end);
  return { dataSize, messages };
}

const u16 = (b: Uint8Array) => b[0]! | (b[1]! << 8);
const u32 = (b: Uint8Array) => (b[0]! | (b[1]! << 8) | (b[2]! << 16) | (b[3]! << 24)) >>> 0;
const str = (b: Uint8Array) => new TextDecoder().decode(b.slice(0, b.indexOf(0) === -1 ? b.length : b.indexOf(0)));

const workout: FitWorkout = {
  name: 'VO2 intervals',
  sport: 'bike',
  steps: [
    { name: 'Warm up', durationSec: 720, intensity: 'warmup', hrLowBpm: 110, hrHighBpm: 135 },
    { name: 'Work', durationSec: 300, intensity: 'active', hrLowBpm: 165, hrHighBpm: 178 },
    { name: 'Recover', durationSec: 180, intensity: 'rest' },
    { name: 'Cool down', durationSec: 600, intensity: 'cooldown' },
  ],
};

describe('encodeFitWorkout', () => {
  const bytes = encodeFitWorkout(workout);

  it('writes a valid FIT header', () => {
    expect(bytes[0]).toBe(14);
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('.FIT');
    const declared = new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true);
    expect(declared).toBe(bytes.length - 14 - 2); // header + data + trailing CRC
  });

  it('checksums both the header and the whole file', () => {
    const headerCrc = bytes[12]! | (bytes[13]! << 8);
    expect(fitCrc(bytes.slice(0, 12))).toBe(headerCrc);

    const fileCrc = bytes[bytes.length - 2]! | (bytes[bytes.length - 1]! << 8);
    expect(fitCrc(bytes, 0, bytes.length - 2)).toBe(fileCrc);
  });

  it('round-trips: an independent reader recovers the workout', () => {
    const { messages } = readFit(bytes);

    const fileId = messages.find((m) => m.global === 0)!;
    expect(fileId.fields.get(0)![0]).toBe(5); // file type: workout

    const wkt = messages.find((m) => m.global === 26)!;
    expect(str(wkt.fields.get(8)!)).toBe('VO2 intervals');
    expect(wkt.fields.get(4)![0]).toBe(2); // sport: bike
    expect(u16(wkt.fields.get(6)!)).toBe(4);

    const steps = messages.filter((m) => m.global === 27);
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => u32(s.fields.get(2)!))).toEqual([720_000, 300_000, 180_000, 600_000]);
    expect(steps.map((s) => s.fields.get(7)![0])).toEqual([2, 0, 1, 3]); // warmup, active, rest, cooldown
    expect(steps.map((s) => u16(s.fields.get(254)!))).toEqual([0, 1, 2, 3]);
  });

  it('encodes an HR range as bpm + 100, and an untargeted step as open', () => {
    const steps = readFit(bytes).messages.filter((m) => m.global === 27);
    const work = steps[1]!;
    expect(work.fields.get(3)![0]).toBe(1); // target_type: heart_rate
    expect(u32(work.fields.get(5)!)).toBe(265); // 165 + 100
    expect(u32(work.fields.get(6)!)).toBe(278); // 178 + 100

    const recover = steps[2]!;
    expect(recover.fields.get(3)![0]).toBe(2); // target_type: open
    expect(u32(recover.fields.get(5)!)).toBe(0);
  });

  it('truncates a long name rather than overrunning the field', () => {
    const long = encodeFitWorkout({ ...workout, name: 'A very long workout name indeed' });
    const wkt = readFit(long).messages.find((m) => m.global === 26)!;
    expect(str(wkt.fields.get(8)!)).toHaveLength(15); // 16-byte field, NUL-terminated
  });

  it('drops non-ASCII rather than mangling it on the watch', () => {
    const accented = encodeFitWorkout({ ...workout, name: 'VO₂ intervals' });
    const wkt = readFit(accented).messages.find((m) => m.global === 26)!;
    expect(str(wkt.fields.get(8)!)).toBe('VO intervals');
  });

  it('refuses to write a workout with no steps', () => {
    expect(() => encodeFitWorkout({ ...workout, steps: [] })).toThrow(/at least one step/);
  });

  it('maps each sport to its FIT enum', () => {
    const sportOf = (w: FitWorkout) => readFit(encodeFitWorkout(w)).messages.find((m) => m.global === 26)!.fields.get(4)![0];
    expect(sportOf({ ...workout, sport: 'run' })).toBe(1);
    expect(sportOf({ ...workout, sport: 'swim' })).toBe(5);
    expect(sportOf({ ...workout, sport: 'other' })).toBe(0);
  });
});

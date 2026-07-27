/**
 * streams.ts — pack numeric activity streams into a bytea-friendly hex string.
 *
 * Streams are large and lazy-loaded (CLAUDE.md §6; ARCH §5). This is a first cut: compact
 * typed-array packing without compression. zstd compression is a planned enhancement; the
 * `compression` column records the actual codec so readers decode correctly.
 */

/** PostgREST bytea input format: `\x` followed by hex. */
export function toByteaHex(bytes: Uint8Array): string {
  let hex = '\\x';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export function packFloat32(values: number[]): Uint8Array {
  const dv = new DataView(new ArrayBuffer(values.length * 4));
  values.forEach((v, i) => dv.setFloat32(i * 4, v, true));
  return new Uint8Array(dv.buffer);
}

export function packInt16(values: number[]): Uint8Array {
  const dv = new DataView(new ArrayBuffer(values.length * 2));
  values.forEach((v, i) => dv.setInt16(i * 2, Math.round(v), true));
  return new Uint8Array(dv.buffer);
}

export function packLatLng(pairs: [number, number][]): Uint8Array {
  const dv = new DataView(new ArrayBuffer(pairs.length * 8));
  pairs.forEach(([lat, lng], i) => {
    dv.setFloat32(i * 8, lat, true);
    dv.setFloat32(i * 8 + 4, lng, true);
  });
  return new Uint8Array(dv.buffer);
}

// ── Reading them back ────────────────────────────────────────────────────────
// Packing existed from the first ingest; nothing ever unpacked, so streams were write-only —
// which is why no screen could show a trace and no job could re-read one. Two consumers now:
// the activity detail view and the nightly mean-max curve.

/** PostgREST returns bytea as `\x…` hex. */
export function fromByteaHex(hex: string): Uint8Array {
  const body = hex.startsWith('\\x') ? hex.slice(2) : hex;
  const out = new Uint8Array(body.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(body.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const view = (bytes: Uint8Array): DataView => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

export function unpackFloat32(hex: string | null): number[] {
  if (!hex) return [];
  const dv = view(fromByteaHex(hex));
  return Array.from({ length: dv.byteLength / 4 }, (_, i) => dv.getFloat32(i * 4, true));
}

export function unpackInt16(hex: string | null): number[] {
  if (!hex) return [];
  const dv = view(fromByteaHex(hex));
  return Array.from({ length: dv.byteLength / 2 }, (_, i) => dv.getInt16(i * 2, true));
}

export function unpackLatLng(hex: string | null): [number, number][] {
  if (!hex) return [];
  const dv = view(fromByteaHex(hex));
  return Array.from({ length: dv.byteLength / 8 }, (_, i) => [dv.getFloat32(i * 8, true), dv.getFloat32(i * 8 + 4, true)]);
}

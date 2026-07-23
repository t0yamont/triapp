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

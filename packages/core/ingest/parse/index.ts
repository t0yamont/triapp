/**
 * ingest/parse/index.ts — format detection + dispatch to the right parser, then normalise.
 * The single entry point the ingest Edge Function calls with an uploaded file.
 */

import { normalizeActivity } from '../normalize.js';
import type { ActivityFormat, IngestProvider, ParsedActivity } from '../types.js';
import { parseFit } from './fit.js';
import { parseGpx } from './gpx.js';
import { parseTcx } from './tcx.js';

export type ParseInput = Uint8Array | ArrayBuffer | string;

function toBytes(input: Uint8Array | ArrayBuffer): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

/** Sniff the format from the file's magic bytes / root element. */
export function detectFormat(input: ParseInput): ActivityFormat {
  let text: string;
  if (typeof input === 'string') {
    text = input;
  } else {
    const b = toBytes(input);
    if (b.length >= 12 && b[8] === 0x2e && b[9] === 0x46 && b[10] === 0x49 && b[11] === 0x54) {
      return 'fit';
    }
    text = new TextDecoder().decode(b.subarray(0, 512));
  }
  const head = text.slice(0, 512).toLowerCase();
  if (head.includes('<trainingcenterdatabase')) return 'tcx';
  if (head.includes('<gpx')) return 'gpx';
  throw new Error('Unrecognised activity file format (not FIT, TCX or GPX)');
}

export interface ParseOptions {
  format?: ActivityFormat;
  provider?: IngestProvider;
}

/** Parse an uploaded activity file of any supported format into a normalised activity. */
export function parseActivityFile(input: ParseInput, opts: ParseOptions = {}): ParsedActivity {
  const format = opts.format ?? detectFormat(input);
  let activity: ParsedActivity;
  if (format === 'fit') {
    if (typeof input === 'string') throw new Error('FIT input must be binary, not a string');
    activity = parseFit(toBytes(input), opts.provider);
  } else {
    const xml = typeof input === 'string' ? input : new TextDecoder().decode(toBytes(input));
    activity = format === 'tcx' ? parseTcx(xml, opts.provider) : parseGpx(xml, opts.provider);
  }
  return normalizeActivity(activity);
}

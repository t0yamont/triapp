/** Shared XML parsing helpers for the GPX/TCX parsers. */
import { XMLParser } from 'fast-xml-parser';

export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: true,
  parseAttributeValue: true,
  trimValues: true,
});

export function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

export function num(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Read a TCX-style `<X><Value>n</Value></X>` or a bare numeric `<X>n</X>`. */
export function valueOf(node: unknown): number | undefined {
  if (node === undefined || node === null) return undefined;
  if (typeof node === 'object' && 'Value' in (node as Record<string, unknown>)) {
    return num((node as Record<string, unknown>)['Value']);
  }
  return num(node);
}

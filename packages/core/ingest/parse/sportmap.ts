/** Sport mapping from the various source vocabularies to our `IngestSport`. */
import type { IngestSport } from '../types.js';

/** Free-text sport (GPX <type>, TCX Sport attribute) → IngestSport. */
export function mapKeywordSport(raw: string | undefined): IngestSport {
  const s = (raw ?? '').toLowerCase();
  if (/run|jog/.test(s)) return 'run';
  if (/bik|cycl|ride|virtualride/.test(s)) return 'bike';
  if (/swim/.test(s)) return 'swim';
  if (/strength|gym|weight/.test(s)) return 'strength';
  if (/brick|transition|multisport/.test(s)) return 'brick';
  return 'other';
}

/** FIT `sport` enum value → IngestSport (FIT Profile: 1 running, 2 cycling, 5 swimming, 10 training). */
export function mapFitSport(value: number | undefined): IngestSport {
  switch (value) {
    case 1:
      return 'run';
    case 2:
      return 'bike';
    case 5:
      return 'swim';
    case 10:
      return 'strength';
    default:
      return 'other';
  }
}

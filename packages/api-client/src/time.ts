/**
 * time.ts — instants in, local calendar days out.
 *
 * CLAUDE.md hard rule 8: "store UTC, compute in the athlete's local zone, and test across a DST
 * boundary." Everything in the database is `timestamptz`, and every question an athlete asks is
 * about a *day* — "why did my Thursday change", "what did I do on Sunday". Those two facts meet
 * here, and getting it wrong is the most common class of bug in this domain, so there is one
 * implementation of the conversion and it is tested across both DST transitions.
 */

/** Cheap per-zone cache: constructing an Intl formatter is not free and this runs per row. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached) return cached;
  // `en-CA` renders as YYYY-MM-DD, which is the ISO calendar date without any string surgery.
  const made = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  formatters.set(timeZone, made);
  return made;
}

/**
 * The calendar date an instant falls on, in the athlete's zone.
 *
 * An unknown zone throws from `Intl`; that would be a corrupt `profiles.timezone`, and falling
 * back to UTC would silently shift dates by up to a day for anyone affected, so it surfaces.
 */
export function localDayISO(instant: string, timeZone: string): string {
  return formatterFor(timeZone).format(new Date(instant));
}

/** True when both instants land on the same local day for this athlete. */
export function isSameLocalDay(a: string, b: string, timeZone: string): boolean {
  return localDayISO(a, timeZone) === localDayISO(b, timeZone);
}

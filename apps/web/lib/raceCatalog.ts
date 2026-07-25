/**
 * lib/raceCatalog.ts — a small curated catalog of real, dated races, so onboarding can offer
 * "pick the race you're training for" instead of only freehand entry. This is reference data,
 * not physiology, so it lives beside `eventMeta.ts` in the app rather than in the engine
 * (CLAUDE.md: `apps/*` is presentation and platform glue).
 *
 * Every date carries its own `dateStatus`, for the same reason every physiological number in
 * this codebase carries a confidence (§2.4): a date we inferred must not read as a date the
 * organiser published.
 *   - `confirmed`  — published for that specific edition and verified against the organiser
 *                    or contemporaneous press in July 2026.
 *   - `provisional` — follows the event's own fixed rule (Boston is Patriots' Day; Peachtree
 *                    is always 4 July; BOLDERBoulder is Memorial Day) but has not been
 *                    confirmed by the organiser for that year yet.
 *
 * The catalog is deliberately indicative, not exhaustive — it cannot be complete and it will
 * go stale, so the freehand "my race isn't listed" path is always available and every
 * selection stays editable. Entry requires a real date the athlete can train towards; a race
 * with a guessed date would silently produce a wrong-length plan, which is exactly the class
 * of error `/spec/00-AGENT-BRIEF.md` warns about.
 *
 * ponytail: a hand-maintained module is right while this is one screen's convenience. Move it
 * to a `race_catalog` table (or an organiser feed) the moment a non-engineer needs to edit it,
 * or coverage has to be broad rather than indicative.
 */

import type { EventType } from '@ironflow/core/physio';

export type RaceDateStatus = 'confirmed' | 'provisional';

export interface CatalogRace {
  id: string;
  name: string;
  /** ISO calendar date (YYYY-MM-DD), the athlete's race day. */
  date: string;
  eventType: EventType;
  location: string;
  dateStatus: RaceDateStatus;
}

/**
 * Curated, verified July 2026. Sorted by date within each event type for readability; callers
 * should not depend on the array order — use `racesForEvent`, which sorts.
 *
 * Coverage is uneven on purpose: long-course triathlon and big-city marathons publish dates
 * far ahead, so they are well represented. Short-course triathlon (sprint/olympic) and 5k are
 * overwhelmingly local, weekly, or announced late — nothing there was verifiable enough to
 * ship, so those distances fall through to freehand entry rather than being padded with
 * plausible-looking guesses.
 */
export const RACE_CATALOG: CatalogRace[] = [
  // ── Full-distance triathlon ────────────────────────────────────────────────
  { id: 'im-kalmar-2026', name: 'IRONMAN Kalmar', date: '2026-08-15', eventType: 'ironman', location: 'Kalmar, Sweden', dateStatus: 'confirmed' },
  { id: 'im-leeds-2026', name: 'IRONMAN Leeds', date: '2026-08-16', eventType: 'ironman', location: 'Leeds, United Kingdom', dateStatus: 'confirmed' },
  { id: 'im-copenhagen-2026', name: 'IRONMAN Copenhagen', date: '2026-08-16', eventType: 'ironman', location: 'Copenhagen, Denmark', dateStatus: 'confirmed' },
  { id: 'im-tallinn-2026', name: 'IRONMAN Tallinn', date: '2026-08-22', eventType: 'ironman', location: 'Tallinn, Estonia', dateStatus: 'confirmed' },
  { id: 'im-vichy-2026', name: 'IRONMAN Vichy', date: '2026-08-23', eventType: 'ironman', location: 'Vichy, France', dateStatus: 'confirmed' },
  { id: 'im-wales-2026', name: 'IRONMAN Wales', date: '2026-09-13', eventType: 'ironman', location: 'Tenby, Wales', dateStatus: 'confirmed' },
  { id: 'im-wisconsin-2026', name: 'IRONMAN Wisconsin', date: '2026-09-13', eventType: 'ironman', location: 'Madison, Wisconsin, USA', dateStatus: 'confirmed' },
  { id: 'im-emilia-romagna-2026', name: 'IRONMAN Italy Emilia-Romagna', date: '2026-09-19', eventType: 'ironman', location: 'Cervia, Italy', dateStatus: 'confirmed' },
  { id: 'im-maryland-2026', name: 'IRONMAN Maryland', date: '2026-09-19', eventType: 'ironman', location: 'Cambridge, Maryland, USA', dateStatus: 'confirmed' },
  { id: 'im-chattanooga-2026', name: 'IRONMAN Chattanooga', date: '2026-09-27', eventType: 'ironman', location: 'Chattanooga, Tennessee, USA', dateStatus: 'confirmed' },
  { id: 'im-barcelona-2026', name: 'IRONMAN Calella-Barcelona', date: '2026-10-04', eventType: 'ironman', location: 'Calella, Spain', dateStatus: 'confirmed' },
  { id: 'im-world-champs-2026', name: 'IRONMAN World Championship', date: '2026-10-10', eventType: 'ironman', location: 'Kailua-Kona, Hawaii, USA', dateStatus: 'confirmed' },
  { id: 'im-cascais-2026', name: 'IRONMAN Portugal-Cascais', date: '2026-10-17', eventType: 'ironman', location: 'Cascais, Portugal', dateStatus: 'confirmed' },
  { id: 'im-california-2026', name: 'IRONMAN California', date: '2026-10-18', eventType: 'ironman', location: 'Sacramento, California, USA', dateStatus: 'confirmed' },
  { id: 'im-australia-2026', name: 'IRONMAN Australia', date: '2026-10-18', eventType: 'ironman', location: 'Port Macquarie, NSW, Australia', dateStatus: 'confirmed' },
  { id: 'im-florida-2026', name: 'IRONMAN Florida', date: '2026-11-07', eventType: 'ironman', location: 'Panama City Beach, Florida, USA', dateStatus: 'confirmed' },
  { id: 'im-malaysia-2026', name: 'IRONMAN Malaysia', date: '2026-11-21', eventType: 'ironman', location: 'Langkawi, Malaysia', dateStatus: 'confirmed' },
  { id: 'im-cozumel-2026', name: 'IRONMAN Cozumel', date: '2026-11-22', eventType: 'ironman', location: 'Cozumel, Mexico', dateStatus: 'confirmed' },
  { id: 'im-western-australia-2026', name: 'IRONMAN Western Australia', date: '2026-12-06', eventType: 'ironman', location: 'Busselton, Western Australia', dateStatus: 'confirmed' },

  // ── Half-distance triathlon (70.3) ─────────────────────────────────────────
  { id: 'im703-northern-california-2026', name: 'IRONMAN 70.3 Northern California', date: '2026-08-16', eventType: '70.3', location: 'Redding, California, USA', dateStatus: 'confirmed' },
  { id: 'im703-weymouth-2026', name: 'IRONMAN 70.3 Weymouth', date: '2026-09-20', eventType: '70.3', location: 'Weymouth, Dorset, UK', dateStatus: 'confirmed' },
  { id: 'im703-cozumel-2026', name: 'IRONMAN 70.3 Cozumel', date: '2026-09-20', eventType: '70.3', location: 'Cozumel, Mexico', dateStatus: 'confirmed' },
  { id: 'im703-new-york-2026', name: 'IRONMAN 70.3 New York', date: '2026-09-26', eventType: '70.3', location: 'New York, USA', dateStatus: 'confirmed' },
  { id: 'im703-augusta-2026', name: 'IRONMAN 70.3 Augusta', date: '2026-09-27', eventType: '70.3', location: 'Augusta, Georgia, USA', dateStatus: 'confirmed' },

  // ── Marathon ───────────────────────────────────────────────────────────────
  { id: 'sydney-marathon-2026', name: 'TCS Sydney Marathon', date: '2026-08-30', eventType: 'marathon', location: 'Sydney, Australia', dateStatus: 'confirmed' },
  { id: 'berlin-marathon-2026', name: 'BMW Berlin Marathon', date: '2026-09-27', eventType: 'marathon', location: 'Berlin, Germany', dateStatus: 'confirmed' },
  { id: 'chicago-marathon-2026', name: 'Bank of America Chicago Marathon', date: '2026-10-11', eventType: 'marathon', location: 'Chicago, Illinois, USA', dateStatus: 'confirmed' },
  { id: 'nyc-marathon-2026', name: 'TCS New York City Marathon', date: '2026-11-01', eventType: 'marathon', location: 'New York City, USA', dateStatus: 'confirmed' },
  { id: 'athens-marathon-2026', name: 'Athens Marathon, the Authentic', date: '2026-11-08', eventType: 'marathon', location: 'Athens, Greece', dateStatus: 'confirmed' },
  { id: 'valencia-marathon-2026', name: 'Valencia Marathon', date: '2026-12-06', eventType: 'marathon', location: 'Valencia, Spain', dateStatus: 'confirmed' },
  { id: 'tokyo-marathon-2027', name: 'Tokyo Marathon', date: '2027-03-07', eventType: 'marathon', location: 'Tokyo, Japan', dateStatus: 'confirmed' },
  // Patriots' Day is the third Monday in April, which is 19 April in 2027.
  { id: 'boston-marathon-2027', name: 'Boston Marathon', date: '2027-04-19', eventType: 'marathon', location: 'Boston, Massachusetts, USA', dateStatus: 'provisional' },
  // London is always a Sunday; the last Sunday in April 2027 is the 25th.
  { id: 'london-marathon-2027', name: 'TCS London Marathon', date: '2027-04-25', eventType: 'marathon', location: 'London, United Kingdom', dateStatus: 'provisional' },

  // ── Half marathon ──────────────────────────────────────────────────────────
  { id: 'great-north-run-2026', name: 'AJ Bell Great North Run', date: '2026-09-13', eventType: 'half_marathon', location: 'Newcastle to South Shields, UK', dateStatus: 'confirmed' },
  { id: 'wrrc-copenhagen-half-2026', name: 'World Road Running Championships Half Marathon', date: '2026-09-20', eventType: 'half_marathon', location: 'Copenhagen, Denmark', dateStatus: 'confirmed' },

  // ── 10k ────────────────────────────────────────────────────────────────────
  // The Great Manchester Run is the Sunday of the late-May bank holiday weekend.
  { id: 'great-manchester-run-2027', name: 'AJ Bell Great Manchester Run', date: '2027-05-30', eventType: '10k', location: 'Manchester, United Kingdom', dateStatus: 'provisional' },
  // BOLDERBoulder is always Memorial Day — the last Monday in May, 31 May in 2027.
  { id: 'bolderboulder-2027', name: 'BOLDERBoulder 10K', date: '2027-05-31', eventType: '10k', location: 'Boulder, Colorado, USA', dateStatus: 'provisional' },
  // The Peachtree Road Race is run on 4 July every year.
  { id: 'peachtree-2027', name: 'AJC Peachtree Road Race', date: '2027-07-04', eventType: '10k', location: 'Atlanta, Georgia, USA', dateStatus: 'provisional' },
];

/**
 * Future races for one distance, soonest first. `from` is the athlete's local today (ISO), so
 * a race happening today is already too late to build a plan towards and is excluded.
 */
export function racesForEvent(eventType: EventType, from: string): CatalogRace[] {
  return RACE_CATALOG.filter((r) => r.eventType === eventType && r.date > from).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

/** Format a catalog date for display, e.g. "13 Sep 2026". */
export function formatRaceDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  // Constructed as UTC and read back as UTC so the label never shifts a day by timezone.
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

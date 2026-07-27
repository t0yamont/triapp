/**
 * consent/policy.ts — lawful basis, versioned (02-ARCHITECTURE.md §7).
 *
 * Health and fitness data is special-category personal data, so processing rests on **explicit
 * consent**, and consent to one version of a policy is not consent to the next one. That makes the
 * version a first-class value rather than a string typed into a form: when it moves, everyone who
 * agreed to the old one has to be asked again, and the app has to be able to tell who they are.
 *
 * Pure and clock-free like the rest of `core`: the caller passes the date.
 */

/**
 * The current health-data consent policy. **Bump this whenever the purposes, the categories of
 * data, or the sub-processors change** — those are the changes that make prior consent invalid.
 * Wording and layout fixes are not; re-prompting for those trains athletes to click through.
 */
export const CONSENT_VERSION = 'v1';

/**
 * UK GDPR sets 16 as the age of consent for information society services (§7, "Age gate: 16+").
 * Below it, consent must come from a parent, which this product has no flow for — so it is a
 * hard stop at sign-up, not a warning.
 */
export const MIN_AGE_YEARS = 16;

/** What a profile row records about consent. */
export interface ConsentRecord {
  healthDataConsentAt: string | null;
  healthDataConsentVersion: string | null;
  medicalDisclaimerAckAt: string | null;
}

export type ConsentGap =
  /** Never consented to health-data processing at all. */
  | 'health_data_missing'
  /** Consented, but to a superseded version of the policy. */
  | 'health_data_outdated'
  /** Never acknowledged that this is training guidance, not medical advice. */
  | 'medical_disclaimer_missing';

export interface ConsentStatus {
  /** True ⇒ there is a lawful basis to process this athlete's health data right now. */
  current: boolean;
  gaps: ConsentGap[];
  /** The version last agreed to, so the re-consent prompt can say what changed. */
  acceptedVersion: string | null;
}

/**
 * Whether an athlete's consent still covers what the app does today.
 *
 * The disclaimer is not separately versioned — the schema stores only an acknowledgement
 * timestamp — so a materially different disclaimer means bumping `CONSENT_VERSION`, which
 * re-prompts for both together.
 */
export function consentStatus(record: ConsentRecord, currentVersion: string = CONSENT_VERSION): ConsentStatus {
  const gaps: ConsentGap[] = [];

  if (record.healthDataConsentAt === null) gaps.push('health_data_missing');
  else if (record.healthDataConsentVersion !== currentVersion) gaps.push('health_data_outdated');

  if (record.medicalDisclaimerAckAt === null) gaps.push('medical_disclaimer_missing');

  return {
    current: gaps.length === 0,
    gaps,
    acceptedVersion: record.healthDataConsentAt === null ? null : record.healthDataConsentVersion,
  };
}

/** A fresh consent, ready to write to `profiles`. */
export function grantConsent(now: string, version: string = CONSENT_VERSION) {
  return {
    health_data_consent_at: now,
    health_data_consent_version: version,
    medical_disclaimer_ack_at: now,
  } as const;
}

// ── Age gate ─────────────────────────────────────────────────────────────────

export type AgeRejection = 'malformed_date' | 'not_yet_born' | 'under_minimum_age';

export type AgeCheck =
  | { eligible: true; ageYears: number }
  | { eligible: false; reason: AgeRejection; ageYears: number | null };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

const readDate = (iso: string): [number, number, number] | null => {
  const m = DATE_RE.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return [y, mo, d];
};

/**
 * Whole calendar years between two dates.
 *
 * Deliberately **not** `(now - dob) / 365.25`, which is fine for an HRmax formula and wrong for a
 * legal threshold: it drifts by up to a day either side of a birthday, and "wrong by a day" on an
 * age gate means admitting a 15-year-old. Both arguments are calendar dates and are compared as
 * such — no `Date`, so no timezone can shift the answer (CLAUDE.md hard rule 8).
 *
 * Someone born on 29 February turns 16 on 1 March in a non-leap year, which is also the position
 * in English law.
 */
export function ageOnDate(dateOfBirth: string, on: string): number | null {
  const dob = readDate(dateOfBirth);
  const today = readDate(on);
  if (!dob || !today) return null;
  const [by, bm, bd] = dob;
  const [ty, tm, td] = today;
  const hadBirthday = tm > bm || (tm === bm && td >= bd);
  return ty - by - (hadBirthday ? 0 : 1);
}

/** The 16+ gate. Rejections are typed so the UI can explain rather than just refuse. */
export function checkAgeEligibility(dateOfBirth: string, today: string, minAge: number = MIN_AGE_YEARS): AgeCheck {
  const age = ageOnDate(dateOfBirth, today);
  if (age === null) return { eligible: false, reason: 'malformed_date', ageYears: null };
  if (age < 0) return { eligible: false, reason: 'not_yet_born', ageYears: age };
  if (age < minAge) return { eligible: false, reason: 'under_minimum_age', ageYears: age };
  return { eligible: true, ageYears: age };
}

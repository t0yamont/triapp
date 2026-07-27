import { describe, expect, it } from 'vitest';
import {
  ageOnDate,
  checkAgeEligibility,
  consentStatus,
  CONSENT_VERSION,
  grantConsent,
  MIN_AGE_YEARS,
  type ConsentRecord,
} from '../policy.js';

const consented = (over: Partial<ConsentRecord> = {}): ConsentRecord => ({
  healthDataConsentAt: '2026-01-04T09:00:00.000Z',
  healthDataConsentVersion: CONSENT_VERSION,
  medicalDisclaimerAckAt: '2026-01-04T09:00:00.000Z',
  ...over,
});

describe('consentStatus', () => {
  it('is current when both were given at the live version', () => {
    const status = consentStatus(consented());
    expect(status).toEqual({ current: true, gaps: [], acceptedVersion: CONSENT_VERSION });
  });

  it('flags an athlete who never consented', () => {
    const status = consentStatus(consented({ healthDataConsentAt: null, healthDataConsentVersion: null }));
    expect(status.current).toBe(false);
    expect(status.gaps).toEqual(['health_data_missing']);
    expect(status.acceptedVersion).toBeNull();
  });

  // The point of versioning: consent to v1 is not consent to v2. Without this the app keeps
  // processing special-category data on a basis the athlete never agreed to.
  it('flags consent given to a superseded policy', () => {
    const status = consentStatus(consented(), 'v2');
    expect(status.current).toBe(false);
    expect(status.gaps).toEqual(['health_data_outdated']);
    // The prompt can say "you agreed to v1; here is what changed".
    expect(status.acceptedVersion).toBe('v1');
  });

  it('flags a missing medical disclaimer on its own', () => {
    const status = consentStatus(consented({ medicalDisclaimerAckAt: null }));
    expect(status.gaps).toEqual(['medical_disclaimer_missing']);
  });

  it('reports both gaps for a profile that has neither', () => {
    const status = consentStatus({
      healthDataConsentAt: null,
      healthDataConsentVersion: null,
      medicalDisclaimerAckAt: null,
    });
    expect(status.gaps).toEqual(['health_data_missing', 'medical_disclaimer_missing']);
  });

  // A row that somehow carries a version but no timestamp has no evidence of when consent was
  // given, which is the part a regulator asks for.
  it('treats a version without a timestamp as no consent', () => {
    expect(consentStatus(consented({ healthDataConsentAt: null })).gaps).toContain('health_data_missing');
  });

  it('grantConsent closes every gap it is written for', () => {
    const written = grantConsent('2026-07-27T10:00:00.000Z');
    const status = consentStatus({
      healthDataConsentAt: written.health_data_consent_at,
      healthDataConsentVersion: written.health_data_consent_version,
      medicalDisclaimerAckAt: written.medical_disclaimer_ack_at,
    });
    expect(status.current).toBe(true);
  });
});

describe('ageOnDate', () => {
  it('counts whole calendar years', () => {
    expect(ageOnDate('2000-06-15', '2026-07-27')).toBe(26);
  });

  it('does not round a birthday up', () => {
    expect(ageOnDate('2010-07-28', '2026-07-27')).toBe(15);
    expect(ageOnDate('2010-07-27', '2026-07-27')).toBe(16);
  });

  it('turns 16 on 1 March for a 29 February birthday', () => {
    expect(ageOnDate('2010-02-29', '2026-02-28')).toBe(15);
    expect(ageOnDate('2010-02-29', '2026-03-01')).toBe(16);
  });

  // A 365.25-day division drifts by up to a day near a birthday; a legal threshold cannot.
  it('agrees with the calendar on the day before and the day of a birthday', () => {
    for (const [dob, day, expected] of [
      ['2010-01-01', '2025-12-31', 15],
      ['2010-01-01', '2026-01-01', 16],
      ['2010-12-31', '2026-12-30', 15],
      ['2010-12-31', '2026-12-31', 16],
    ] as const) {
      expect(ageOnDate(dob, day)).toBe(expected);
    }
  });

  it('reads a date out of a full ISO instant', () => {
    expect(ageOnDate('2000-06-15', '2026-07-27T23:30:00.000Z')).toBe(26);
  });

  it('returns null for input it cannot read', () => {
    expect(ageOnDate('15/06/2000', '2026-07-27')).toBeNull();
    expect(ageOnDate('2000-06-15', 'not a date')).toBeNull();
    expect(ageOnDate('2000-13-15', '2026-07-27')).toBeNull();
    expect(ageOnDate('2000-06-00', '2026-07-27')).toBeNull();
  });
});

describe('checkAgeEligibility — the 16+ gate', () => {
  it('admits an athlete on their sixteenth birthday, and not the day before', () => {
    expect(checkAgeEligibility('2010-07-27', '2026-07-27')).toEqual({ eligible: true, ageYears: 16 });
    expect(checkAgeEligibility('2010-07-28', '2026-07-27')).toEqual({
      eligible: false,
      reason: 'under_minimum_age',
      ageYears: 15,
    });
    expect(MIN_AGE_YEARS).toBe(16);
  });

  it('rejects a date of birth in the future rather than reporting a negative age', () => {
    expect(checkAgeEligibility('2030-01-01', '2026-07-27')).toMatchObject({
      eligible: false,
      reason: 'not_yet_born',
    });
  });

  it('rejects input it cannot parse instead of guessing', () => {
    expect(checkAgeEligibility('', '2026-07-27')).toEqual({
      eligible: false,
      reason: 'malformed_date',
      ageYears: null,
    });
  });

  it('takes a different minimum for a jurisdiction that sets one', () => {
    expect(checkAgeEligibility('2013-07-27', '2026-07-27', 13).eligible).toBe(true);
  });
});

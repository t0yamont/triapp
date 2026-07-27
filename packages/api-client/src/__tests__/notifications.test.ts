import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTIFICATION_PREFS,
  notificationFor,
  readNotificationPrefs,
  NOTIFICATION_KINDS,
} from '../repositories/notifications.js';

describe('notificationFor', () => {
  // The one that matters: the engine quietly easing tomorrow, which the athlete did not ask for
  // and would otherwise discover by opening the app.
  it('notifies for an engine decision, reusing the sentence the engine already wrote', () => {
    const payload = notificationFor({
      actor: 'engine',
      reasonCode: 'READINESS_2DAY_LOW',
      reasonText: 'Two low mornings, so today’s intervals became an easy run.',
    })!;
    expect(payload.kind).toBe('plan_change');
    expect(payload.body).toBe('Two low mornings, so today’s intervals became an easy run.');
    expect(payload.deepLink).toBe('/today');
  });

  it('notifies for a system decision too', () => {
    expect(notificationFor({ actor: 'system', reasonCode: 'X', reasonText: 'y' })).not.toBeNull();
  });

  // Telling someone they did the thing they just did is noise, and noise is what teaches people
  // to dismiss notifications without reading them.
  it('says nothing about an action the athlete took themselves', () => {
    expect(notificationFor({ actor: 'athlete', reasonCode: 'ATHLETE_SKIPPED', reasonText: 'You skipped it.' })).toBeNull();
  });

  it('says nothing about a coach action either', () => {
    expect(notificationFor({ actor: 'coach', reasonCode: 'COACH_EDIT', reasonText: 'Coach moved it.' })).toBeNull();
  });
});

describe('readNotificationPrefs', () => {
  it('defaults every kind on for a profile that has never set them', () => {
    expect(readNotificationPrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    for (const kind of NOTIFICATION_KINDS) expect(DEFAULT_NOTIFICATION_PREFS[kind]).toBe(true);
  });

  it('honours a stored choice', () => {
    expect(readNotificationPrefs({ plan_change: false }).plan_change).toBe(false);
  });

  // A kind added after the athlete last saved must default on, not vanish into `undefined` and
  // silently switch itself off.
  it('fills in a kind the stored object predates', () => {
    const prefs = readNotificationPrefs({ plan_change: false });
    expect(prefs.test_due).toBe(true);
    expect(prefs.check_in_reminder).toBe(true);
  });

  it('ignores junk rather than throwing', () => {
    expect(readNotificationPrefs('nonsense' as never)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(readNotificationPrefs([1, 2] as never)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(readNotificationPrefs({ plan_change: 'yes' } as never).plan_change).toBe(true);
  });
});

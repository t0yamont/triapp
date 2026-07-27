/**
 * repositories/notifications.ts — telling the athlete something changed (ARCH §5).
 *
 * The architecture states the chain plainly: "Plan adaptation (if triggers fire) → plan_mutations
 * (audit) → notification", and `notifications.plan_mutation_id` exists to carry it. Three code
 * paths wrote the audit row and none of them ever wrote the second half, so the table had no rows
 * and Settings offered four toggles that controlled nothing.
 *
 * The audit row and the notification are the same event seen twice: `plan_mutations` is the
 * permanent record, retained indefinitely; a notification is the transient "you have not seen
 * this yet". Writing them together is what keeps them from drifting apart.
 */

import type { TriflowClient } from '../client.js';
import type { Json } from '../database.types.js';
import type { TablesInsert } from '../types.js';

/** The kinds that have a real producer. A kind nobody emits is a toggle that lies. */
export const NOTIFICATION_KINDS = ['plan_change', 'test_due', 'check_in_reminder'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type NotificationPrefs = Record<NotificationKind, boolean>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  plan_change: true,
  test_due: true,
  check_in_reminder: true,
};

/** Tolerant of a null column, a partial object, or junk — an unreadable pref means the default. */
export function readNotificationPrefs(stored: Json | null | undefined): NotificationPrefs {
  const raw = typeof stored === 'object' && stored !== null && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  return Object.fromEntries(
    NOTIFICATION_KINDS.map((kind) => [kind, typeof raw[kind] === 'boolean' ? (raw[kind] as boolean) : DEFAULT_NOTIFICATION_PREFS[kind]]),
  ) as NotificationPrefs;
}

export interface NotificationPayload {
  kind: NotificationKind;
  title: string;
  body: string;
  deepLink?: string;
}

export interface MutationSummary {
  actor: string;
  reasonCode: string;
  reasonText: string;
}

/**
 * The notification a plan mutation deserves, or null for one that deserves none.
 *
 * **An athlete is never notified about their own action.** They moved the session; telling them
 * they moved it is noise, and noise is what teaches people to swipe notifications away without
 * reading — including the one that matters, which is the engine quietly easing tomorrow.
 */
export function notificationFor(mutation: MutationSummary): NotificationPayload | null {
  if (mutation.actor !== 'engine' && mutation.actor !== 'system') return null;
  return {
    kind: 'plan_change',
    title: 'Your plan changed',
    // The engine already wrote an athlete-facing sentence at decision time; rewriting it here
    // would give the same event two different explanations.
    body: mutation.reasonText,
    deepLink: '/today',
  };
}

/**
 * Insert plan-mutation audit rows and the notifications they imply, in that order.
 *
 * Returns the same `{ error }` shape the callers already branch on, so each keeps its own
 * rollback: an unaudited plan change violates hard rule 10 and every caller undoes it. A failed
 * *notification* is deliberately not an error — the plan change is correct and audited, and
 * discarding it because a courtesy message did not send would be the wrong trade.
 */
export async function insertPlanMutations(
  client: TriflowClient,
  rows: TablesInsert<'plan_mutations'>[],
  prefs: NotificationPrefs = DEFAULT_NOTIFICATION_PREFS,
): Promise<{ error: { message: string } | null }> {
  const { data, error } = await client.from('plan_mutations').insert(rows).select('id, actor, reason_code, reason_text');
  if (error) return { error };
  if (!prefs.plan_change) return { error: null };

  const notifications = (data ?? []).flatMap((row) => {
    const payload = notificationFor({ actor: row.actor, reasonCode: row.reason_code, reasonText: row.reason_text });
    return payload ? [{ athlete_id: rows[0]!.athlete_id, plan_mutation_id: row.id, ...payload, deep_link: payload.deepLink ?? null }] : [];
  });
  if (notifications.length > 0) {
    await client.from('notifications').insert(notifications.map(({ deepLink: _drop, ...n }) => n) as never);
  }
  return { error: null };
}

/** Fire-and-forget for the kinds that come from a job rather than a plan write. */
export async function notify(client: TriflowClient, athleteId: string, payload: NotificationPayload): Promise<void> {
  await client
    .from('notifications')
    .insert({ athlete_id: athleteId, kind: payload.kind, title: payload.title, body: payload.body, deep_link: payload.deepLink ?? null });
}

export interface AthleteNotification {
  id: number;
  kind: string;
  title: string;
  body: string;
  deepLink: string | null;
  createdAt: string;
}

export async function getUnreadNotifications(client: TriflowClient, athleteId: string): Promise<AthleteNotification[]> {
  const { data } = await client
    .from('notifications')
    .select('id, kind, title, body, deep_link, created_at')
    .eq('athlete_id', athleteId)
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(20);
  return (data ?? []).map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    deepLink: n.deep_link,
    createdAt: n.created_at,
  }));
}

export async function markNotificationsRead(client: TriflowClient, ids: readonly number[], now: string): Promise<void> {
  if (ids.length === 0) return;
  await client.from('notifications').update({ read_at: now }).in('id', ids as number[]);
}

// ── The time-based kinds ────────────────────────────────────────────────────

/**
 * The two notifications that come from the calendar rather than from a plan write, raised by the
 * nightly job because that is the only thing that knows it is the athlete's morning.
 *
 * Both are **idempotent for the day**: the job runs hourly and only acts near local 03:00, but a
 * retry, a backfill or a timezone change must not produce the same nudge twice. Existing unread
 * notifications of the same kind are the check — cheaper than a separate "last sent" column, and
 * self-clearing when the athlete reads it.
 */
export async function notifyDue(client: TriflowClient, athleteId: string, today: string): Promise<NotificationKind[]> {
  const { data: profile } = await client
    .from('profiles')
    .select('notification_prefs')
    .eq('id', athleteId)
    .maybeSingle();
  const prefs = readNotificationPrefs(profile?.notification_prefs);

  const unread = await getUnreadNotifications(client, athleteId);
  const pending = new Set(unread.map((n) => n.kind));
  const sent: NotificationKind[] = [];

  if (prefs.test_due && !pending.has('test_due')) {
    const { data: due } = await client
      .from('field_tests')
      .select('id, sport')
      .eq('athlete_id', athleteId)
      .eq('status', 'scheduled')
      .lte('scheduled_date', today)
      .limit(1);
    if (due && due.length > 0) {
      await notify(client, athleteId, {
        kind: 'test_due',
        title: 'A test is due',
        // §12: "tests are prescriptions, not suggestions" — an unmeasured anchor decays and the
        // plan turns conservative around it, which the athlete experiences as it going stale.
        body: `Your ${due[0]!.sport} test is scheduled for today or earlier. Until it happens, the plan stays cautious.`,
        deepLink: '/settings',
      });
      sent.push('test_due');
    }
  }

  if (prefs.check_in_reminder && !pending.has('check_in_reminder')) {
    const { count } = await client
      .from('daily_metrics')
      .select('athlete_id', { count: 'exact', head: true })
      .eq('athlete_id', athleteId)
      .eq('date', today);
    if ((count ?? 0) === 0) {
      await notify(client, athleteId, {
        kind: 'check_in_reminder',
        title: 'How did you sleep?',
        body: 'A 20-second check-in is what lets today’s session adapt to you.',
        deepLink: '/today',
      });
      sent.push('check_in_reminder');
    }
  }

  return sent;
}

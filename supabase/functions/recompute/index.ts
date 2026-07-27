// supabase/functions/recompute — the nightly recompute.
//
// Deno Edge Function (NOT part of the pnpm typecheck), same shape as `ingest`: thin glue over the
// typechecked, unit-tested packages. All the maths is in @ironflow/core/physio; the read/compute/
// write shell is `recomputeDailyMetrics` / `recomputeMeanMax` in @ironflow/api-client.
//
// `20260722120300_scheduled_jobs.sql` has been POSTing here hourly since the schema landed and
// this function did not exist, so CTL/ATL/TSB, monotony, strain and every mean-max curve were
// never written for anybody. That migration is the caller; do not rename the route.
//
// Deploy:  supabase functions deploy recompute --no-verify-jwt
//
// **--no-verify-jwt is required.** pg_cron calls this with the service-role key over pg_net, not
// with an athlete's JWT. Authorisation is done below instead: the caller must present the
// service-role key, and only then may it recompute for athletes other than itself.

import {
  createServiceClient,
  notifyDue,
  recomputeDailyMetrics,
  recomputeMeanMax,
  withJobLog,
} from '@ironflow/api-client';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** The athlete's own local date — the day the metrics are being computed *for* (hard rule 8). */
function localToday(timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date());
}

/**
 * The cron fires hourly and this picks out the athletes for whom it is now ~03:00 locally, which
 * is how one schedule serves every timezone without a per-athlete cron entry.
 */
function isLocalNight(timezone: string, hour = 3): boolean {
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hour12: false }).format(new Date());
  return Number(local) === hour;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
  };

  // This function bypasses RLS, so the caller must prove it is the scheduler. A wrong key here
  // would otherwise mean recomputing — and reading — every athlete in the project.
  const presented = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!serviceKey || presented !== serviceKey) return json({ error: 'unauthorized' }, 401);

  let client;
  try {
    client = createServiceClient(env);
  } catch {
    return json({ error: 'server misconfigured' }, 500);
  }

  const url = new URL(req.url);
  const only = url.searchParams.get('athlete');
  // `?force=1` ignores the local-hour filter — for a backfill or a manual re-run.
  const force = url.searchParams.get('force') === '1';

  const { data: profiles, error } = await client
    .from('profiles')
    .select('id, timezone')
    .then((r) => (only ? { ...r, data: (r.data ?? []).filter((p) => p.id === only) } : r));
  if (error) return json({ error: error.message }, 500);

  const due = (profiles ?? []).filter((p) => force || only !== null || isLocalNight(p.timezone));
  let ok = 0;
  const failed: string[] = [];

  for (const profile of due) {
    try {
      await withJobLog({ job: 'nightly_recompute', athleteId: profile.id, fields: { provider: 'internal' } }, async () => {
        const today = localToday(profile.timezone);
        const daily = await recomputeDailyMetrics(client, profile.id, today);
        const curves = await recomputeMeanMax(client, profile.id, today);
        // The nightly job is the only thing that knows it is the athlete's morning, so it is
        // also where the two time-based notifications belong.
        const sent = await notifyDue(client, profile.id, today);
        return { ...daily, ...curves, notified: sent };
      });
      ok += 1;
    } catch {
      // One athlete's bad data must not stop the other 999. `withJobLog` has already emitted the
      // error line with the athlete id, which is what the alert rules read.
      failed.push(profile.id);
    }
  }

  return json({ considered: (profiles ?? []).length, ran: ok, failed }, failed.length > 0 ? 207 : 200);
});

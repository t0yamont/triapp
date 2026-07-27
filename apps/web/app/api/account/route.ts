/**
 * /api/account — self-service hard delete (02-ARCHITECTURE.md §7).
 *
 * Everything else in this app talks to Supabase from the browser under RLS, and erasure *almost*
 * can too: `own_profile` is a `for all` policy, and every personal-data table cascades from
 * `profiles`. What the browser cannot do is delete the `auth.users` row — `profiles.id` references
 * it, not the other way round, so the cascade runs in the wrong direction and the athlete's email
 * would survive the deletion of everything else. That needs the service-role key, and the
 * service-role key must never reach a browser (CLAUDE.md §4).
 *
 * Hence one server route. The athlete id comes from the verified access token and **never** from
 * the request body, so this cannot be pointed at somebody else's account.
 */

import { createBrowserClient, createServiceClient, deleteAthleteData, withJobLog } from '@ironflow/api-client';
import { NextResponse } from 'next/server';

// Needs the service-role key and the admin API; not an edge-runtime route.
export const runtime = 'nodejs';

const bearer = (header: string | null): string | null => {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};

export async function DELETE(request: Request): Promise<Response> {
  const token = bearer(request.headers.get('authorization'));
  if (!token) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  let athleteId: string;
  try {
    // The anon client validates the JWT against Supabase — this is the only thing that decides
    // whose account is being erased.
    const { data, error } = await createBrowserClient().auth.getUser(token);
    if (error || !data.user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
    athleteId = data.user.id;
  } catch {
    // Missing/invalid Supabase env: refuse rather than half-run a deletion.
    return NextResponse.json({ error: 'Account deletion is not available.' }, { status: 503 });
  }

  try {
    return await withJobLog({ job: 'account.erase', athleteId }, async () => {
      const service = createServiceClient();

      // Reads the provider connections first, deletes the profile, then re-counts to prove it.
      const erasure = await deleteAthleteData(service, athleteId);

      // The auth user last: while it exists the athlete can still sign in, and if the step above
      // failed we want them able to retry rather than locked out of a half-erased account.
      const { error: authError } = await service.auth.admin.deleteUser(athleteId);
      if (authError) throw new Error(`auth user not deleted: ${authError.message}`);

      return NextResponse.json({
        verified: erasure.verified,
        remaining: erasure.remaining,
        // Tables whose count could not be read. Without these, "all zero" would mean "everything
        // we managed to check was empty", which is not the same claim.
        unreadable: erasure.unreadable,
        // Refs, not tokens — the tokens live in Vault. Revoking at each provider and destroying
        // the secrets is a separate job; surfacing the list here is what makes it auditable.
        providersToRevoke: erasure.providersToRevoke.map((p) => p.provider),
      });
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : 'Deletion failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

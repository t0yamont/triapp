// supabase/functions/ingest — activity upload → parsed → deduped → stored.
//
// Deno Edge Function (NOT part of the pnpm typecheck). It is thin glue: all real logic lives
// in the typechecked, unit-tested packages it composes —
//   @ironflow/core/ingest   parseActivityFile (FIT/TCX/GPX → normalised activity, with RR)
//   @ironflow/api-client    createServiceClient, ingestRequestSchema, upsertParsedActivity
//
// Deploy:  supabase functions deploy ingest
// The bundler resolves the workspace packages' TypeScript on deploy. If your setup can't
// resolve workspace TS, build the packages first (pnpm -r build) or add an import map.
//
// Requires: migrations applied; Supabase injects SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
// The caller is authenticated by their JWT (Authorization: Bearer <token>); the athlete id
// is taken from the verified token, never trusted from the request body.

import { parseActivityFile } from '@ironflow/core/ingest';
import { createServiceClient, ingestRequestSchema, upsertParsedActivity } from '@ironflow/api-client';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  // Supabase auto-injects these for deployed functions; map to the names api-client expects.
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  };

  let client;
  try {
    client = createServiceClient(env);
  } catch {
    return json({ error: 'server misconfigured' }, 500);
  }

  // Identify the athlete from the verified JWT, not from the request.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: authErr } = await client.auth.getUser(token);
  if (authErr || !userData.user) return json({ error: 'unauthorized' }, 401);

  try {
    const url = new URL(req.url);
    const request = ingestRequestSchema.parse({
      athleteId: userData.user.id,
      provider: url.searchParams.get('provider') ?? undefined,
      format: url.searchParams.get('format') ?? undefined,
    });

    const bytes = new Uint8Array(await req.arrayBuffer());
    if (bytes.length === 0) return json({ error: 'empty body' }, 400);

    const activity = parseActivityFile(bytes, { provider: request.provider, format: request.format });
    const result = await upsertParsedActivity(client, request.athleteId, activity);
    return json(result, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'ingest failed' }, 400);
  }
});

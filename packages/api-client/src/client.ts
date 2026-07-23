/**
 * client.ts — the Supabase client factories. This package is the ONLY place that talks to
 * Supabase (CLAUDE.md §Architecture).
 *
 * - `createBrowserClient` uses the anon key and respects RLS as the logged-in athlete.
 * - `createServiceClient` uses the service-role key, bypasses RLS, and is SERVER-ONLY. It
 *   throws if it ever runs in a browser.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';
import { isBrowser, readPublicEnv, readServiceEnv } from './env.js';

export type IronflowClient = SupabaseClient<Database>;

type EnvSource = Record<string, string | undefined>;

/** Browser/anon client. Every query runs under the athlete's RLS policies. */
export function createBrowserClient(env?: EnvSource): IronflowClient {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = readPublicEnv(env);
  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

/**
 * Service-role client for Edge Functions / server code. Bypasses RLS, so callers MUST scope
 * every query by athlete_id themselves. Never import this into client code.
 */
export function createServiceClient(env?: EnvSource): IronflowClient {
  if (isBrowser()) {
    throw new Error('createServiceClient must never be called in the browser (CLAUDE.md §4; ARCH §6)');
  }
  const { NEXT_PUBLIC_SUPABASE_URL } = readPublicEnv(env);
  const { SUPABASE_SERVICE_ROLE_KEY } = readServiceEnv(env);
  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

'use client';

import { createBrowserClient, type TriflowClient } from '@ironflow/api-client';
import { useMemo } from 'react';

// NEXT_PUBLIC_* are inlined at build time. When absent (e.g. before Supabase is connected),
// the app still builds and renders — forms are wired but disabled with a clear notice.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function supabaseConfigured(): boolean {
  return Boolean(url && anon);
}

/** Memoised anon Supabase client, or null when the env is not configured. */
export function useSupabase(): TriflowClient | null {
  return useMemo(() => {
    if (!url || !anon) return null;
    return createBrowserClient({ NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon });
  }, []);
}

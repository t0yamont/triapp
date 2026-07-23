/**
 * env.ts — Zod-validated environment (CLAUDE.md §5: Zod-validate everything crossing a
 * boundary). The public keys are browser-safe; the service-role key is SERVER-ONLY and is
 * validated separately so it is never even read in a public context (§4; ARCH §6).
 */

import { z } from 'zod';

type EnvSource = Record<string, string | undefined>;

const defaultSource = (): EnvSource =>
  typeof process !== 'undefined' && process.env ? process.env : {};

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

const serviceEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServiceEnv = z.infer<typeof serviceEnvSchema>;

export function readPublicEnv(source: EnvSource = defaultSource()): PublicEnv {
  return publicEnvSchema.parse(source);
}

/** Read the server-only service-role env. Throws if called in a browser (defence in depth). */
export function isBrowser(): boolean {
  return typeof (globalThis as { window?: unknown }).window !== 'undefined';
}

export function readServiceEnv(source: EnvSource = defaultSource()): ServiceEnv {
  if (isBrowser()) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY must never be read in the browser (CLAUDE.md §4)');
  }
  return serviceEnvSchema.parse(source);
}

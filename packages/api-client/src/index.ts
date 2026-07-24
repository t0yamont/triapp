/**
 * @ironflow/api-client — the ONLY place that talks to Supabase / third-party APIs
 * (CLAUDE.md §Architecture). Typed against the generated `Database`.
 */

export type { Database } from './database.types.js';
export * from './types.js';
export * from './env.js';
export * from './client.js';
export * from './schemas.js';
export * from './streams.js';
export * from './repositories/activities.js';
export * from './repositories/plans.js';

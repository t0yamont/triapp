/**
 * observability/log.ts — one structured line per job (02-ARCHITECTURE.md §8).
 *
 * §8 asks for "structured logging on every Edge Function with `athlete_id`, `job`, `duration_ms`,
 * `outcome`". Those four fields are what makes the sync dashboard and the alert rules possible at
 * all — a free-text log answers "did it work?" but never "what fraction of Garmin syncs failed in
 * the last hour?".
 *
 * It lives in `api-client` rather than `core` because every job that needs it is an I/O job, and
 * `core` may not read a clock. Here a clock is fine, and is injectable so the tests stay honest.
 */

export type JobOutcome = 'ok' | 'error';

export interface JobLogEntry {
  job: string;
  athleteId?: string;
  durationMs: number;
  outcome: JobOutcome;
  /**
   * The error *message* only. Never the error object or a response body: those routinely carry
   * access tokens and provider payloads, and a log is the last place special-category data or a
   * credential should end up.
   */
  error?: string;
  /** Anything job-specific: provider, activity count, rule id. */
  [field: string]: unknown;
}

/** One JSON object per line — the shape log aggregators can actually query. */
export function formatJobLog(entry: JobLogEntry): string {
  return JSON.stringify({ level: entry.outcome === 'error' ? 'error' : 'info', ...entry });
}

export interface JobContext {
  job: string;
  athleteId?: string;
  /** Extra fields to merge into the line. */
  fields?: Record<string, unknown>;
  /** Defaults to `console.log`/`console.error`. */
  sink?: (line: string, outcome: JobOutcome) => void;
  /** Defaults to `Date.now`. */
  now?: () => number;
}

const defaultSink = (line: string, outcome: JobOutcome): void => {
  if (outcome === 'error') console.error(line);
  else console.log(line);
};

/**
 * Run a job, log exactly one line for it, and **rethrow on failure**. Swallowing the error here
 * would turn a failed sync into a logged success from the caller's point of view, which is the
 * one thing observability must not do.
 */
export async function withJobLog<T>(context: JobContext, run: () => Promise<T>): Promise<T> {
  const now = context.now ?? Date.now;
  const sink = context.sink ?? defaultSink;
  const startedAt = now();

  const emit = (outcome: JobOutcome, extra: Record<string, unknown>): void => {
    sink(
      formatJobLog({
        job: context.job,
        ...(context.athleteId === undefined ? {} : { athleteId: context.athleteId }),
        durationMs: now() - startedAt,
        outcome,
        ...context.fields,
        ...extra,
      }),
      outcome,
    );
  };

  try {
    const result = await run();
    emit('ok', {});
    return result;
  } catch (cause) {
    emit('error', { error: cause instanceof Error ? cause.message : String(cause) });
    throw cause;
  }
}

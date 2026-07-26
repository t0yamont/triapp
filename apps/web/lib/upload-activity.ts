'use client';

/**
 * lib/upload-activity.ts — send an activity file to the ingest Edge Function, then attribute
 * it to the session it completed.
 *
 * The file is **never parsed here**. Hard rule #7: FIT parsing happens server-side, in
 * `supabase/functions/ingest`, which already composes the tested parser + dedupe pipeline.
 * This is transport plus the follow-up link, nothing more.
 */

import { linkActivityToPlannedWorkout } from '@ironflow/api-client';
import type { ActivityMatch } from '@ironflow/core/physio';
import { useCallback, useState } from 'react';
import { useSupabase } from './supabase';

/** Formats the ingest function accepts, inferred from the filename. */
const FORMATS: Record<string, 'fit' | 'tcx' | 'gpx'> = { fit: 'fit', tcx: 'tcx', gpx: 'gpx' };

export function formatOf(fileName: string): 'fit' | 'tcx' | 'gpx' | null {
  return FORMATS[fileName.split('.').pop()?.toLowerCase() ?? ''] ?? null;
}

export type UploadOutcome =
  | { status: 'uploaded'; activityId: string; duplicate: boolean; match: ActivityMatch | null }
  | { status: 'error'; message: string };

export interface UseActivityUpload {
  busy: boolean;
  result: UploadOutcome | null;
  upload: (file: File) => Promise<void>;
  reset: () => void;
}

export function useActivityUpload(): UseActivityUpload {
  const supabase = useSupabase();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadOutcome | null>(null);

  const upload = useCallback(
    async (file: File): Promise<void> => {
      if (!supabase) return setResult({ status: 'error', message: 'Not connected to your account.' });

      const format = formatOf(file.name);
      if (!format) {
        return setResult({ status: 'error', message: `${file.name} isn't a .fit, .tcx or .gpx file.` });
      }

      setBusy(true);
      setResult(null);
      try {
        // The function identifies the athlete from this token, never from the request body.
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;
        if (!token) throw new Error('Sign in to upload an activity.');

        const { data: fn, error: fnError } = await supabase.functions.invoke<{
          activityId?: string;
          outcome?: string;
          error?: string;
        }>(`ingest?format=${format}&provider=file`, {
          body: await file.arrayBuffer(),
          headers: { 'content-type': 'application/octet-stream' },
        });
        if (fnError) throw fnError;
        if (!fn?.activityId) throw new Error(fn?.error ?? 'The file could not be read.');

        // Attribute it to a planned session. A failure here must not lose the activity —
        // it is already stored, and can be linked later.
        let match: ActivityMatch | null = null;
        try {
          const { data: auth } = await supabase.auth.getUser();
          if (auth.user) match = await linkActivityToPlannedWorkout(supabase, auth.user.id, fn.activityId);
        } catch {
          match = null;
        }

        setResult({
          status: 'uploaded',
          activityId: fn.activityId,
          duplicate: fn.outcome === 'idempotent_noop' || fn.outcome === 'deduped_as_source',
          match,
        });
      } catch (e) {
        setResult({ status: 'error', message: e instanceof Error ? e.message : 'Upload failed.' });
      } finally {
        setBusy(false);
      }
    },
    [supabase],
  );

  return { busy, result, upload, reset: () => setResult(null) };
}

'use client';

/**
 * lib/history-import.ts — onboarding step 5, "import history — up to 24 months, with progress".
 *
 * Reuses `uploadActivityFile`, so history import and the single-file drop take the same server
 * path: the ingest Edge Function parses and dedupes (hard rule 7 — nothing is parsed in the
 * browser). The only thing added here is doing it many times and saying how far along it is.
 *
 * ponytail: sequential, one file at a time. A 24-month export is a few hundred files and this
 * takes a while — but each upload is a parse plus several writes on the same Edge Function, and
 * firing them in parallel trades a progress bar the athlete trusts for rate limits and a
 * dedupe race. Add a small concurrency limit if real imports prove too slow.
 */

import { useCallback, useState } from 'react';
import { useSupabase } from './supabase';
import { formatOf, uploadActivityFile } from './upload-activity';

/** §7: don't ingest more than the engine uses. 24 months is the roadmap's own limit. */
export const HISTORY_MONTHS = 24;

export interface ImportProgress {
  total: number;
  done: number;
  imported: number;
  duplicates: number;
  failed: { file: string; message: string }[];
  running: boolean;
}

const EMPTY: ImportProgress = { total: 0, done: 0, imported: 0, duplicates: 0, failed: [], running: false };

export interface UseHistoryImport {
  progress: ImportProgress;
  importFiles: (files: FileList | File[]) => Promise<void>;
  reset: () => void;
}

export function useHistoryImport(): UseHistoryImport {
  const supabase = useSupabase();
  const [progress, setProgress] = useState<ImportProgress>(EMPTY);

  const importFiles = useCallback(
    async (files: FileList | File[]): Promise<void> => {
      if (!supabase) return;
      // Filter before counting, so the progress total is the number of files that can actually
      // be imported rather than everything in the folder they dragged in.
      const usable = [...files].filter((f) => formatOf(f.name) !== null);
      if (usable.length === 0) return;

      setProgress({ ...EMPTY, total: usable.length, running: true });

      for (const file of usable) {
        const outcome = await uploadActivityFile(supabase, file);
        setProgress((p) => ({
          ...p,
          done: p.done + 1,
          imported: p.imported + (outcome.status === 'uploaded' && !outcome.duplicate ? 1 : 0),
          // A re-uploaded file is not a failure — the dedupe is doing its job, and an athlete
          // importing twice should see that plainly rather than a wall of red.
          duplicates: p.duplicates + (outcome.status === 'uploaded' && outcome.duplicate ? 1 : 0),
          failed: outcome.status === 'error' ? [...p.failed, { file: file.name, message: outcome.message }] : p.failed,
        }));
      }

      setProgress((p) => ({ ...p, running: false }));
    },
    [supabase],
  );

  return { progress, importFiles, reset: () => setProgress(EMPTY) };
}

'use client';

/**
 * Download today's session as a `.FIT` file the athlete can side-load onto a watch.
 *
 * Fetches the athlete's zones on demand rather than on mount: it is one round trip, needed only
 * if the button is pressed, and Today already makes several.
 */

import { getCurrentZones } from '@ironflow/api-client';
import type { ZoneSet } from '@ironflow/core/physio';
import { useState } from 'react';
import { downloadSessionFit } from './session-file';
import type { PlannedSession } from './today-demo';
import { useSupabase } from './supabase';

export function useSessionDownload(): { download: (session: PlannedSession, dateLabel: string) => void; note: string | null } {
  const supabase = useSupabase();
  const [note, setNote] = useState<string | null>(null);

  const download = (session: PlannedSession, dateLabel: string): void => {
    void (async () => {
      let zones: ZoneSet | null = null;
      if (supabase) {
        try {
          const { data: auth } = await supabase.auth.getUser();
          if (auth.user) {
            const rows = await getCurrentZones(supabase, auth.user.id);
            const forSport = rows.find((z) => z.sport === session.sport) ?? rows[0];
            zones = (forSport?.zones as unknown as ZoneSet) ?? null;
          }
        } catch {
          zones = null; // an open workout is still a usable workout
        }
      }
      const ok = downloadSessionFit(session, zones, dateLabel);
      // Saying which is the point: a file with no HR targets is not broken, but the athlete
      // should know their watch will only count down rather than hold them in a zone.
      setNote(ok ? (zones ? 'Downloaded with your HR targets.' : 'Downloaded — no zones yet, so the steps are open.') : null);
    })();
  };

  return { download, note };
}

'use client';

/**
 * Connected devices, from the `integrations` table rather than from three hardcoded objects that
 * claimed Garmin was connected and had synced two hours ago. A fabricated "connected" state is
 * the worst kind of wrong: an athlete reads it and stops wondering why nothing is importing.
 *
 * No provider connection ships yet, so in practice everything here reads "coming soon" — which is
 * the true state. The query is real so that the moment one connects, this shows it.
 */

import { Card } from '@ironflow/ui';
import { useEffect, useState } from 'react';
import { useSupabase } from '../../lib/supabase';

const PROVIDERS = [
  { id: 'garmin', name: 'Garmin Connect', detail: 'Activities, HRV, sleep and resting HR' },
  { id: 'strava', name: 'Strava', detail: 'Activities' },
  { id: 'apple_health', name: 'Apple Health', detail: 'HRV, sleep and resting HR — with the mobile app' },
];

interface Connection {
  provider: string;
  connectedAt: string;
  lastSyncAt: string | null;
}

const ago = (iso: string | null): string => {
  if (!iso) return 'no sync yet';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `synced ${mins}m ago`;
  if (mins < 1440) return `synced ${Math.floor(mins / 60)}h ago`;
  return `synced ${Math.floor(mins / 1440)}d ago`;
};

export function DevicesCard() {
  const supabase = useSupabase();
  const [connections, setConnections] = useState<Connection[]>([]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from('integrations')
        .select('provider, connected_at, last_sync_at')
        .eq('athlete_id', auth.user.id)
        .is('revoked_at', null);
      if (alive && data) {
        setConnections(data.map((r) => ({ provider: r.provider, connectedAt: r.connected_at, lastSyncAt: r.last_sync_at })));
      }
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-widest text-faint">Connected devices</span>
        <span className="text-body text-muted">
          Where your training and recovery data comes from. Until a provider connects, upload files from Activities —
          the engine treats them identically.
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {PROVIDERS.map((p) => {
          const live = connections.find((c) => c.provider === p.id);
          return (
            <div
              key={p.id}
              className={`flex items-center justify-between gap-4 rounded-control border border-white/[0.06] bg-white/[0.02] px-4 py-3 ${live ? '' : 'opacity-60'}`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${live ? 'bg-ok shadow-[0_0_8px_rgba(53,214,164,0.7)]' : 'bg-faint'}`}
                  aria-hidden
                />
                <div className="flex flex-col">
                  <span className="text-body text-text">{p.name}</span>
                  <span className="text-label text-faint">{live ? ago(live.lastSyncAt) : p.detail}</span>
                </div>
              </div>
              <span aria-disabled={live ? undefined : 'true'} className="shrink-0 text-label text-faint">
                {live ? 'Connected' : 'Coming soon'}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

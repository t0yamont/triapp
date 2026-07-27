'use client';

/**
 * NotificationsCard — the "you haven't seen this yet" half of a plan change (ARCH §5).
 *
 * The decision log below it is the permanent record and is always there; this is only what is
 * still unread, and it disappears once read. Marking read is an explicit button, not an on-render
 * side effect: a card that clears itself because the page happened to load is how an athlete
 * misses the one telling them tomorrow got easier.
 */

import { getUnreadNotifications, markNotificationsRead, type AthleteNotification } from '@ironflow/api-client';
import { Button, Card } from '@ironflow/ui';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSupabase } from '../../lib/supabase';

export function NotificationsCard() {
  const supabase = useSupabase();
  const [items, setItems] = useState<AthleteNotification[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const unread = await getUnreadNotifications(supabase, auth.user.id);
      if (alive) setItems(unread);
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  if (items.length === 0) return null;

  async function dismissAll(): Promise<void> {
    if (!supabase) return;
    setBusy(true);
    await markNotificationsRead(supabase, items.map((n) => n.id), new Date().toISOString());
    setItems([]);
    setBusy(false);
  }

  return (
    <Card className="flex flex-col gap-4 border-accent/25 bg-accent/[0.05]">
      <div className="flex items-center justify-between gap-4">
        <span className="text-label uppercase tracking-widest text-accent">
          {items.length} new {items.length === 1 ? 'update' : 'updates'}
        </span>
        <Button variant="ghost" onClick={() => void dismissAll()} disabled={busy}>
          Mark all read
        </Button>
      </div>
      <div className="flex flex-col gap-3">
        {items.map((n) => (
          <div key={n.id} className="flex flex-col gap-0.5 border-l-2 border-l-accent/60 pl-3.5">
            <span className="text-body font-medium text-text">{n.title}</span>
            <span className="text-label text-muted">{n.body}</span>
            {n.deepLink && n.deepLink !== '/today' ? (
              <Link href={n.deepLink} className="w-fit text-label text-accent underline underline-offset-4">
                Open
              </Link>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

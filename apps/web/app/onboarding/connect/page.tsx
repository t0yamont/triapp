'use client';

/**
 * Onboarding steps 4–5 — "connect a device" and "import history" (06-UX.md §4).
 *
 * Both were missing entirely; the flow went from "about you" straight to availability, so an
 * athlete had no way to give the engine any training history and every plan was seeded from a
 * self-reported guess.
 *
 * The two spec steps are one screen because with no provider integration there is nothing to
 * separate: step 4's third option is "upload a history export", and step 5 is the progress of
 * that upload. A screen whose only content is "your import is running" would be a step that
 * exists to match a number.
 *
 * The providers are shown and disabled, deliberately. They are the primary route and an athlete
 * should see they are coming — but a Connect button that opened nothing would be the same lie as
 * the export button that downloaded nothing.
 */

import { Button, Card } from '@ironflow/ui';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { NotConnectedBanner } from '../../../components/NotConnectedBanner';
import { HISTORY_MONTHS, useHistoryImport } from '../../../lib/history-import';
import { supabaseConfigured } from '../../../lib/supabase';

const PROVIDERS = [
  { name: 'Garmin Connect', detail: 'Activities, HRV, sleep and resting HR' },
  { name: 'Strava', detail: 'Activities' },
  { name: 'Apple Health', detail: 'HRV, sleep and resting HR — arrives with the mobile app' },
];

export default function ConnectPage() {
  const router = useRouter();
  const { progress, importFiles } = useHistoryImport();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
  const finished = progress.total > 0 && !progress.running;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <header className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-widest text-faint">Step 4 of 8</span>
        <h1 className="text-h1 text-text">Bring your training in</h1>
        <p className="text-body text-muted">
          The more the engine can see, the less it has to assume. Up to {HISTORY_MONTHS} months is useful; anything is
          better than nothing, and you can skip this and add it later.
        </p>
      </header>

      <Card className="flex flex-col gap-3">
        <span className="text-label uppercase tracking-widest text-faint">Connect a device</span>
        {PROVIDERS.map((p) => (
          <div
            key={p.name}
            className="flex items-center justify-between gap-4 rounded-control border border-white/[0.06] bg-white/[0.02] px-4 py-3 opacity-60"
          >
            <div className="flex flex-col">
              <span className="text-body text-text">{p.name}</span>
              <span className="text-label text-faint">{p.detail}</span>
            </div>
            <span aria-disabled="true" className="shrink-0 text-label text-faint">
              Coming soon
            </span>
          </div>
        ))}
      </Card>

      {/* Card takes no DOM handlers; the drop target is the wrapper, same as `UploadActivity`. */}
      <div
        onDragOver={(e: React.DragEvent) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e: React.DragEvent) => {
          e.preventDefault();
          setDragging(false);
          void importFiles(e.dataTransfer.files);
        }}
        className={`rounded-card transition-shadow ${dragging ? 'ring-2 ring-accent/50' : ''}`}
      >
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-label uppercase tracking-widest text-faint">Or import an export</span>
          <span className="text-body text-muted">
            Drop your .fit, .tcx or .gpx files — the whole folder from a Garmin or Strava export is fine.
          </span>
        </div>

        {!supabaseConfigured() && <NotConnectedBanner />}

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".fit,.tcx,.gpx"
          className="hidden"
          onChange={(e) => void importFiles(e.target.files ?? [])}
        />
        <div>
          <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={progress.running || !supabaseConfigured()}>
            {progress.running ? 'Importing…' : 'Choose files'}
          </Button>
        </div>

        {progress.total > 0 && (
          <div className="flex flex-col gap-2">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
              <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-label text-muted">
              {progress.done} of {progress.total} · {progress.imported} imported
              {progress.duplicates > 0 ? ` · ${progress.duplicates} already had` : ''}
              {progress.failed.length > 0 ? ` · ${progress.failed.length} couldn’t be read` : ''}
            </span>
            {finished && progress.failed.length > 0 && (
              <details className="text-label text-faint">
                <summary className="cursor-pointer">Which ones failed</summary>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {progress.failed.slice(0, 10).map((f) => (
                    <li key={f.file}>
                      {f.file} — {f.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </Card>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={() => router.push('/onboarding/availability')} disabled={progress.running}>
          Continue
        </Button>
        {progress.total === 0 && <span className="text-label text-faint">You can skip this.</span>}
      </div>
    </main>
  );
}

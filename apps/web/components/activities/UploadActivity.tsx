'use client';

/**
 * Drop a .fit/.tcx/.gpx file to ingest it. The file goes straight to the ingest Edge
 * Function — nothing is parsed in the browser (hard rule #7) — and the result says plainly
 * which planned session it was attributed to, or that it wasn't.
 */

import { Button, Card } from '@ironflow/ui';
import { useRef, useState } from 'react';
import { useActivityUpload } from '../../lib/upload-activity';
import { supabaseConfigured } from '../../lib/supabase';

export function UploadActivity() {
  const { busy, result, upload, reset } = useActivityUpload();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void upload(file);
  };

  return (
    <div
      onDragOver={(e: React.DragEvent) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        take(e.dataTransfer.files);
      }}
      className={`rounded-card transition-colors ${dragging ? 'ring-2 ring-accent/50' : ''}`}
    >
      <Card className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-body text-text">Add a session</span>
          <span className="text-label text-faint">
            {supabaseConfigured()
              ? 'Drop a .fit, .tcx or .gpx file here, or choose one. It’s read on the server, never on your device.'
              : 'Connect your account to upload activities.'}
          </span>
        </div>
        <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={busy || !supabaseConfigured()}>
          {busy ? 'Reading…' : 'Choose file'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".fit,.tcx,.gpx"
          className="hidden"
          onChange={(e) => {
            take(e.target.files);
            e.target.value = ''; // let the same file be re-picked after an error
          }}
        />
      </div>

        {result ? <Outcome result={result} onDismiss={reset} /> : null}
      </Card>
    </div>
  );
}

function Outcome({ result, onDismiss }: { result: NonNullable<ReturnType<typeof useActivityUpload>['result']>; onDismiss: () => void }) {
  if (result.status === 'error') {
    return (
      <p className="flex items-start gap-2 text-body text-risk">
        {result.message}
        <button type="button" onClick={onDismiss} className="ml-auto shrink-0 text-faint hover:text-text" aria-label="Dismiss">
          ✕
        </button>
      </p>
    );
  }

  const line = result.duplicate
    ? 'Already had this one — nothing duplicated.'
    : result.match
      ? `Logged, and matched to your planned session${result.match.dayOffset > 0 ? ' from the day before' : ''}.`
      : 'Logged. Nothing planned matched it, so it counts as training but isn’t tied to a session.';

  return (
    <p className={`flex items-start gap-2 text-body ${result.match ? 'text-ok' : 'text-muted'}`}>
      {line}
      {result.match && result.match.durationDeltaMin < 0 ? (
        <span className="text-faint">{Math.abs(result.match.durationDeltaMin)} min short of plan.</span>
      ) : null}
      <button type="button" onClick={onDismiss} className="ml-auto shrink-0 text-faint hover:text-text" aria-label="Dismiss">
        ✕
      </button>
    </p>
  );
}

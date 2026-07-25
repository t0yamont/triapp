'use client';

import { persistWorkoutMoves, resolveWeekEdits, type MovableWorkout, type WorkoutMove } from '@ironflow/api-client';
import {
  RESCHEDULE_REASON,
  isValidWeek,
  moveSession,
  type GuardrailWeek,
  type PlanSport,
  type WeekSession,
} from '@ironflow/core/physio';
import { cn } from '@ironflow/ui';
import { useEffect, useState } from 'react';
import { WEEKDAYS } from '../../lib/days';
import { dayOfWeekISO, todayISO, useLiveWeek } from '../../lib/live-plan';
import { useSupabase } from '../../lib/supabase';
import {
  AVAILABLE_DAYS,
  SAMPLE_WEEK,
  SPORT_META,
  TODAY_INDEX,
  durationLabel,
  sessionTitle,
} from '../../lib/calendar-demo';

type Pick = { fromDay: number; sport: PlanSport };
type Result = ReturnType<typeof moveSession>;
type SaveState = { status: 'idle' | 'saving' | 'saved' } | { status: 'error'; message: string };

/** Restore these rows to the dates they held before the move — the undo write. */
const movesBackTo = (snapshot: readonly MovableWorkout[], current: readonly MovableWorkout[]): WorkoutMove[] =>
  snapshot.flatMap((was) => {
    const now = current.find((r) => r.id === was.id);
    if (!now || now.scheduled_date === was.scheduled_date) return [];
    return [{ id: was.id, scheduledDate: was.scheduled_date, originalDate: was.original_scheduled_date ?? was.scheduled_date }];
  });

/** Apply persisted moves to the local row cache, so a second move builds on the first. */
const withMovesApplied = (rows: readonly MovableWorkout[], moves: readonly WorkoutMove[]): MovableWorkout[] =>
  rows.map((r) => {
    const move = moves.find((m) => m.id === r.id);
    return move ? { ...r, scheduled_date: move.scheduledDate, original_scheduled_date: move.originalDate } : r;
  });

const shortOf = (index: number): string => WEEKDAYS.find((d) => d.index === index)?.short ?? '';

function SessionChip({
  session,
  selected,
  onPick,
  onDragStart,
}: {
  session: WeekSession;
  selected: boolean;
  onPick: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const sport = SPORT_META[session.sport];
  return (
    <button
      type="button"
      draggable
      onClick={onPick}
      onDragStart={onDragStart}
      title={session.isHard ? `${sessionTitle(session)} · key session` : sessionTitle(session)}
      className={cn(
        'group relative w-full cursor-grab overflow-hidden rounded-control border p-2.5 pl-3 text-left transition-all duration-150 active:cursor-grabbing',
        sport.tint,
        selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-transparent' : 'hover:border-white/25',
      )}
    >
      {session.isHard ? <span className="absolute inset-y-0 left-0 w-[3px] bg-warn" aria-hidden /> : null}
      <div className="flex items-start gap-1.5">
        <span className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', sport.dot)} aria-hidden />
        <span className="text-label font-semibold leading-tight text-text">{sessionTitle(session)}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-muted">
        <span>{durationLabel(session.durationMin)}</span>
        <span className="text-faint">·</span>
        <span className={session.sZone === 'S3' ? 'text-zone-z5' : session.sZone === 'S2' ? 'text-zone-z3' : 'text-muted'}>
          {session.sZone}
        </span>
      </div>
    </button>
  );
}

export function WeekBoard() {
  const { live } = useLiveWeek();
  const supabase = useSupabase();
  const [week, setWeek] = useState<GuardrailWeek>(SAMPLE_WEEK);
  const [selected, setSelected] = useState<Pick | null>(null);
  const [feedback, setFeedback] = useState<Result | null>(null);
  const [history, setHistory] = useState<GuardrailWeek | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  // The persisted rows behind `week`, kept in step so a second move builds on the first.
  const [rows, setRows] = useState<MovableWorkout[]>([]);
  const [rowsBefore, setRowsBefore] = useState<MovableWorkout[] | null>(null);
  const [save, setSave] = useState<SaveState>({ status: 'idle' });

  // Swap the sample for the persisted week once it loads (fires once per mount).
  useEffect(() => {
    if (!live) return;
    setWeek(live.week);
    setRows(live.rows);
  }, [live]);

  const valid = isValidWeek(week);
  const todayIndex = live ? dayOfWeekISO(todayISO()) : TODAY_INDEX;

  /** Write a set of moves plus its audit row; on failure, put the board back. */
  async function commit(moves: WorkoutMove[], mutation: Result['mutation'], revertTo: GuardrailWeek, revertRows: MovableWorkout[]) {
    if (!live || !supabase || !mutation || moves.length === 0) return;
    setSave({ status: 'saving' });
    try {
      await persistWorkoutMoves(supabase, { athleteId: live.athleteId, planId: live.planId, moves, mutation });
      setRows((current) => withMovesApplied(current, moves));
      setSave({ status: 'saved' });
    } catch (error) {
      // The write didn't land, so the board must not keep showing it as though it did.
      setWeek(revertTo);
      setRows(revertRows);
      setRowsBefore(null);
      setHistory(null);
      setSave({ status: 'error', message: error instanceof Error ? error.message : 'Could not save that move.' });
    }
  }

  function applyMove(fromDay: number, toDay: number, sport: PlanSport) {
    setSelected(null);
    setDragOver(null);
    if (fromDay === toDay) return;
    const result = moveSession(week, { fromDay, toDay, sport }, { availableDays: AVAILABLE_DAYS });
    if (!result.changed) {
      setFeedback(result);
      return;
    }
    const priorWeek = week;
    const priorRows = rows;
    setHistory(priorWeek);
    setWeek(result.week);
    setFeedback(result);

    // Only commit a week the engine actually cleared: `remainingViolations` empty ⇒ safe to
    // commit. The unresolved case still returns a mutation, so it can't be the gate — that
    // week stays local for the athlete to review or undo.
    if (!live || result.remainingViolations.length > 0) {
      setSave({ status: 'idle' });
      return;
    }
    setRowsBefore(priorRows);
    void commit(resolveWeekEdits(priorRows, result.edits, live.weekStart), result.mutation, priorWeek, priorRows);
  }

  function onChipPick(e: React.MouseEvent, session: WeekSession) {
    e.stopPropagation();
    if (selected && !(selected.fromDay === session.dayOfWeek && selected.sport === session.sport)) {
      applyMove(selected.fromDay, session.dayOfWeek, selected.sport);
      return;
    }
    setSelected(
      selected && selected.fromDay === session.dayOfWeek && selected.sport === session.sport
        ? null
        : { fromDay: session.dayOfWeek, sport: session.sport },
    );
  }

  function undo() {
    if (!history) return;
    const restoring = history;
    const snapshot = rowsBefore;
    setWeek(restoring);
    setHistory(null);
    setFeedback(null);

    // If the move was committed, undoing it is a plan change too — it gets its own audit row
    // rather than silently diverging the board from what's stored.
    if (!live || !snapshot) return;
    setRowsBefore(null);
    void commit(
      movesBackTo(snapshot, rows),
      {
        actor: 'athlete',
        reasonCode: RESCHEDULE_REASON.UNDONE,
        reasonText: 'Undid the move — the sessions went back to the days they were on.',
      },
      week,
      rows,
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-label uppercase tracking-widest text-faint">
            {live ? `${live.week.phase.replace('_', ' ')} · this week` : 'Build · week 3 · sample'}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label',
              valid ? 'bg-ok/12 text-ok' : 'bg-risk/12 text-risk',
            )}
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', valid ? 'bg-ok' : 'bg-risk')} aria-hidden />
            {valid ? 'Guardrails clear' : 'Needs attention'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator save={save} live={Boolean(live)} />
          <span className="text-label text-muted">
            {selected ? 'Now tap a day to move it there' : 'Tap a session, then a day — or drag it'}
          </span>
        </div>
      </div>

      {save.status === 'error' ? (
        <div className="glass flex items-start gap-3 rounded-card p-3 ring-1 ring-risk/30">
          <p className="text-body text-risk">
            {save.message} — the board has been put back to what&rsquo;s saved.
          </p>
          <button
            type="button"
            onClick={() => setSave({ status: 'idle' })}
            className="ml-auto shrink-0 text-faint transition-colors hover:text-text"
            aria-label="Dismiss"
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-4 w-4">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[820px] grid-cols-7 gap-2.5">
          {WEEKDAYS.map((day) => {
            const sessions = week.sessions.filter((s) => s.dayOfWeek === day.index);
            const isToday = day.index === todayIndex;
            const isTarget = selected != null || dragOver === day.index;
            return (
              <div
                key={day.index}
                onClick={() => selected && applyMove(selected.fromDay, day.index, selected.sport)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(day.index);
                }}
                onDragLeave={() => setDragOver((d) => (d === day.index ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  const raw = e.dataTransfer.getData('text/plain');
                  const [from, sport] = raw.split(':');
                  if (from && sport) applyMove(Number(from), day.index, sport as PlanSport);
                }}
                className={cn(
                  'glass flex min-h-[220px] flex-col gap-2 rounded-card p-2.5 transition-colors',
                  dragOver === day.index && 'ring-2 ring-accent',
                  selected && dragOver !== day.index && 'ring-1 ring-accent/30',
                )}
              >
                <div className="flex items-center justify-between px-1">
                  <span className={cn('text-label font-semibold', isToday ? 'text-accent-bright' : 'text-muted')}>{day.short}</span>
                  {isToday ? <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(109,139,255,0.9)]" aria-hidden /> : null}
                </div>
                <div className="flex flex-col gap-2">
                  {sessions.map((session) => (
                    <SessionChip
                      key={`${session.dayOfWeek}-${session.sport}-${session.sZone}`}
                      session={session}
                      selected={
                        selected != null && selected.fromDay === session.dayOfWeek && selected.sport === session.sport
                      }
                      onPick={(e) => onChipPick(e, session)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', `${session.dayOfWeek}:${session.sport}`);
                        e.dataTransfer.effectAllowed = 'move';
                        setSelected({ fromDay: session.dayOfWeek, sport: session.sport });
                      }}
                    />
                  ))}
                  {sessions.length === 0 ? (
                    <div className={cn('rounded-control border border-dashed py-4 text-center text-label', isTarget ? 'border-accent/40 text-accent-bright' : 'border-white/8 text-faint')}>
                      {isTarget ? 'Move here' : 'Rest'}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {feedback ? <MoveFeedback result={feedback} onUndo={history ? undo : undefined} onDismiss={() => setFeedback(null)} /> : null}
    </div>
  );
}

/**
 * Whether the last move actually reached the database. Silent for the sample athlete, where
 * there is nothing to save and claiming "saved" would be a lie.
 */
function SaveIndicator({ save, live }: { save: SaveState; live: boolean }) {
  if (!live || save.status === 'idle' || save.status === 'error') return null;
  const saving = save.status === 'saving';
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-label', saving ? 'text-muted' : 'text-ok')}>
      <span className={cn('h-1.5 w-1.5 rounded-full', saving ? 'animate-pulse bg-muted' : 'bg-ok')} aria-hidden />
      {saving ? 'Saving…' : 'Saved'}
    </span>
  );
}

function MoveFeedback({ result, onUndo, onDismiss }: { result: Result; onUndo?: () => void; onDismiss: () => void }) {
  const failed = result.remainingViolations.length > 0;
  const tone = !result.changed ? 'muted' : failed ? 'risk' : 'ok';
  return (
    <div
      className={cn(
        'glass-raised flex flex-col gap-3 rounded-card p-4 animate-fade-rise',
        tone === 'ok' && 'ring-1 ring-ok/25',
        tone === 'risk' && 'ring-1 ring-risk/30',
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full',
            tone === 'ok' && 'bg-ok/15 text-ok',
            tone === 'risk' && 'bg-risk/15 text-risk',
            tone === 'muted' && 'bg-white/8 text-muted',
          )}
        >
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            {tone === 'ok' ? <path d="M5 10.5l3.5 3.5L15 6.5" /> : tone === 'risk' ? <path d="M10 6.5v4M10 13.5h.01M10 3 3 16h14L10 3Z" /> : <path d="M10 6v5M10 14h.01" />}
          </svg>
        </span>
        <p className="text-body text-text/90">{result.message}</p>
        <button type="button" onClick={onDismiss} className="ml-auto shrink-0 text-faint transition-colors hover:text-text" aria-label="Dismiss">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-4 w-4">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>

      {result.edits.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 pl-9">
          {result.edits.map((edit, i) => (
            <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.05] px-2.5 py-1 font-mono text-[11px] tabular-nums text-muted">
              <span className={cn('h-1.5 w-1.5 rounded-full', SPORT_META[edit.sport].dot)} aria-hidden />
              {SPORT_META[edit.sport].label} {shortOf(edit.fromDay)} → {shortOf(edit.toDay)}
              <span className={cn('ml-0.5', edit.byEngine ? 'text-accent-bright' : 'text-faint')}>{edit.byEngine ? 'auto' : 'you'}</span>
            </span>
          ))}
          {onUndo ? (
            <button type="button" onClick={onUndo} className="ml-1 rounded-full border border-white/12 bg-white/[0.05] px-3 py-1 text-label text-text transition-colors hover:bg-white/[0.1]">
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

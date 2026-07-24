import type { MacroWeek, PlanPhase } from '@ironflow/core/physio';

const PHASE: Record<PlanPhase, { label: string; color: string }> = {
  base: { label: 'Base', color: '#35D6A4' },
  build: { label: 'Build', color: '#6D8BFF' },
  peak: { label: 'Peak', color: '#7C6CF5' },
  taper: { label: 'Taper', color: '#F4B740' },
  recovery: { label: 'Recovery', color: '#4A5265' },
  race_week: { label: 'Race', color: '#FF6B7A' },
  transition: { label: 'Transition', color: '#4A5265' },
};

const MAJORS: PlanPhase[] = ['base', 'build', 'peak', 'taper', 'race_week'];

/** The macrocycle as a phase bar — one segment per week (recovery weeks muted), labelled blocks. */
export function PhaseTimeline({ weeks }: { weeks: MacroWeek[] }) {
  const n = weeks.length;
  const blocks = MAJORS.map((ph) => {
    const idx = weeks.map((w, i) => (w.phase === ph ? i : -1)).filter((i) => i >= 0);
    return idx.length ? { phase: ph, start: Math.min(...idx), end: Math.max(...idx) } : null;
  }).filter((b): b is { phase: PlanPhase; start: number; end: number } => b !== null);

  const present = MAJORS.filter((ph) => weeks.some((w) => w.phase === ph));
  const hasRecovery = weeks.some((w) => w.isRecoveryWeek);

  return (
    <div className="flex flex-col gap-2.5">
      {/* phase labels */}
      <div className="relative hidden h-4 sm:block">
        {blocks.map((b) => (
          <span
            key={b.phase}
            className="absolute truncate text-center text-label font-medium text-muted"
            style={{ left: `${(b.start / n) * 100}%`, width: `${((b.end - b.start + 1) / n) * 100}%` }}
          >
            {PHASE[b.phase].label}
          </span>
        ))}
      </div>

      {/* week segments */}
      <div className="flex h-8 gap-px overflow-hidden rounded-control">
        {weeks.map((w) => (
          <span
            key={w.weekNumber}
            className="flex-1"
            style={{ backgroundColor: PHASE[w.phase].color, opacity: w.isRecoveryWeek ? 0.4 : 0.9 }}
            title={`Week ${w.weekNumber} · ${PHASE[w.phase].label}${w.isRecoveryWeek ? ' (recovery)' : ''}`}
          />
        ))}
      </div>

      {/* ticks */}
      <div className="flex items-center justify-between text-label text-faint">
        <span className="text-accent-bright">Now · wk 1</span>
        <span>{n} weeks to race day</span>
      </div>

      {/* legend */}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1.5">
        {present.map((ph) => (
          <span key={ph} className="inline-flex items-center gap-1.5 text-label text-muted">
            <span className="h-2 w-2 rounded-[3px]" style={{ backgroundColor: PHASE[ph].color }} aria-hidden />
            {PHASE[ph].label}
          </span>
        ))}
        {hasRecovery ? (
          <span className="inline-flex items-center gap-1.5 text-label text-muted">
            <span className="h-2 w-2 rounded-[3px] opacity-40" style={{ backgroundColor: '#8894a8' }} aria-hidden />
            Recovery week
          </span>
        ) : null}
      </div>
    </div>
  );
}

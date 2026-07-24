import { Card } from '@ironflow/ui';
import { WeekBoard } from '../../../components/calendar/WeekBoard';

export default function CalendarPage() {
  return (
    <div className="flex animate-fade-rise flex-col gap-7">
      <header className="flex flex-col gap-2">
        <h1 className="text-display text-text">Calendar</h1>
        <p className="max-w-2xl text-body text-muted">
          Drag a session to another day — the engine validates the move, repairs the week if it breaks a
          guardrail, and tells you exactly what else it moved before you commit.
        </p>
      </header>

      <Card raised className="flex flex-col gap-5">
        <WeekBoard />
      </Card>

      <p className="text-label text-faint">
        Moves run through <code className="font-mono text-muted">moveSession</code> in
        <code className="font-mono text-muted"> @ironflow/core/physio</code> — the same pure, tested repair
        engine (F10, §8.4). Every change would be written as one audited plan mutation.
      </p>
    </div>
  );
}

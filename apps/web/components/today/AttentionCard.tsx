import { Card } from '@ironflow/ui';
import type { AttentionItem } from '../../lib/today-demo';

const TONE_BORDER: Record<AttentionItem['tone'], string> = {
  accent: 'border-accent/30',
  warn: 'border-warn/30',
  risk: 'border-risk/30',
};
const TONE_DOT: Record<AttentionItem['tone'], string> = { accent: 'bg-accent', warn: 'bg-warn', risk: 'bg-risk' };

/** "Attention" surfaces only when something is true (06-UX.md §5) — render nothing otherwise. */
export function AttentionCard({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-h2 text-text">Attention</h2>
      <ul className="flex flex-col gap-3">
        {items.map((item, i) => (
          <li key={i} className={`flex gap-3 rounded-control border ${TONE_BORDER[item.tone]} bg-raised/40 p-3`}>
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE_DOT[item.tone]}`} aria-hidden />
            <div className="flex flex-col gap-0.5">
              <span className="text-label font-medium text-text">{item.title}</span>
              <span className="text-body text-muted">{item.detail}</span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

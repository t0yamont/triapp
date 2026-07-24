import { Card } from '@ironflow/ui';
import type { AttentionItem } from '../../lib/today-demo';

const TONE_EDGE: Record<AttentionItem['tone'], string> = {
  accent: 'border-l-accent',
  warn: 'border-l-warn',
  risk: 'border-l-risk',
};

/** "Attention" surfaces only when something is true (06-UX.md §5) — render nothing otherwise. */
export function AttentionCard({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card className="flex flex-col items-start gap-4 lg:flex-row lg:items-center lg:gap-7">
      <span className="shrink-0 text-label uppercase tracking-widest text-faint">Attention</span>
      <div className="flex w-full flex-col gap-4 lg:flex-row lg:items-baseline lg:gap-7">
        {items.map((item, i) => (
          <div key={i} className={`flex flex-1 flex-col gap-1 border-l-2 pl-3.5 ${TONE_EDGE[item.tone]} lg:flex-row lg:items-baseline lg:gap-2.5`}>
            <span className="text-label font-medium text-text">{item.title}</span>
            <span className="text-label text-muted">{item.detail}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

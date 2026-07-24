import { Card } from '@ironflow/ui';
import type { ReactNode } from 'react';
import type { AttentionItem } from '../../lib/today-demo';

const TONE: Record<AttentionItem['tone'], { edge: string; chip: string; icon: ReactNode }> = {
  accent: {
    edge: 'before:bg-accent',
    chip: 'bg-accent/15 text-accent-bright',
    icon: <path d="M10 3.5 12 8l4.5.5-3.3 3 .9 4.5L10 13.8 5.9 16l.9-4.5L3.5 8.5 8 8l2-4.5Z" />,
  },
  warn: {
    edge: 'before:bg-warn',
    chip: 'bg-warn/15 text-warn',
    icon: <path d="M10 6.5v4M10 13.5h.01M10 3 3 16h14L10 3Z" />,
  },
  risk: {
    edge: 'before:bg-risk',
    chip: 'bg-risk/15 text-risk',
    icon: <path d="M10 6.5v4M10 13.5h.01M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z" />,
  },
};

/** "Attention" surfaces only when something is true (06-UX.md §5) — render nothing otherwise. */
export function AttentionCard({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card className="flex flex-col gap-4">
      <span className="text-label uppercase tracking-widest text-faint">Attention</span>
      <ul className="flex flex-col gap-3">
        {items.map((item, i) => {
          const t = TONE[item.tone];
          return (
            <li
              key={i}
              className={`relative flex gap-3 overflow-hidden rounded-control bg-white/[0.03] p-3.5 pl-4 before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${t.edge}`}
            >
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${t.chip}`}>
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  {t.icon}
                </svg>
              </span>
              <div className="flex flex-col gap-0.5">
                <span className="text-label font-semibold text-text">{item.title}</span>
                <span className="text-body text-muted">{item.detail}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

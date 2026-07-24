import type { ReactNode } from 'react';
import { cn } from '../cn.js';

/**
 * A frosted-glass panel — the app's primary surface (DESIGN.md "Instrument glass").
 * Translucent fill + backdrop blur + a light-catching top edge, floating over the
 * aurora ground. `raised` lifts a panel that needs to sit above its neighbours.
 */
export function Card({
  children,
  className,
  raised = false,
}: {
  children: ReactNode;
  className?: string;
  raised?: boolean;
}) {
  return (
    <div className={cn(raised ? 'glass-raised' : 'glass', 'rounded-card p-6', className)}>{children}</div>
  );
}

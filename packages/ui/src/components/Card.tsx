import type { ReactNode } from 'react';
import { cn } from '../cn.js';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-card border border-white/10 bg-surface p-6', className)}>{children}</div>
  );
}

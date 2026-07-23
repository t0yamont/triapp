import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react';
import { cn } from '../cn.js';

const FIELD =
  'w-full rounded-control bg-surface border border-white/10 px-3 py-2 text-body text-text ' +
  'placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ' +
  'disabled:opacity-50';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(FIELD, className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(FIELD, className)} {...props}>
      {children}
    </select>
  );
}

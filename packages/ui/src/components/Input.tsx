import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react';
import { cn } from '../cn.js';

const FIELD =
  'w-full rounded-control bg-white/[0.04] border border-white/10 px-3.5 py-2.5 text-body text-text ' +
  'placeholder:text-faint transition-colors duration-150 ease-standard ' +
  'hover:border-white/20 focus:border-accent/70 focus:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-accent/25 ' +
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

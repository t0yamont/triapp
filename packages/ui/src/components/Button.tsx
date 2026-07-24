import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../cn.js';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  // Accent fill with a soft periwinkle glow and a top-edge highlight.
  primary:
    'bg-accent text-white shadow-[0_10px_28px_-10px_rgba(109,139,255,0.7),0_1px_0_0_rgba(255,255,255,0.25)_inset] ' +
    'hover:bg-accent-bright hover:shadow-[0_12px_32px_-8px_rgba(109,139,255,0.85)]',
  // Frosted glass for secondary actions.
  secondary: 'bg-white/[0.06] text-text border border-white/12 backdrop-blur-sm hover:bg-white/[0.1] hover:border-white/20',
  ghost: 'text-muted hover:text-text hover:bg-white/[0.05]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children?: ReactNode;
}

export function Button({ variant = 'primary', className, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-control px-4 py-2.5 text-label font-medium',
        'transition-all duration-200 ease-standard disabled:pointer-events-none disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

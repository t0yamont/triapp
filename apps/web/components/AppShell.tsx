'use client';

import { cn } from '@ironflow/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV = [
  { href: '/today', label: 'Today' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/activities', label: 'Activities' },
  { href: '/analytics', label: 'Analytics' },
  { href: '/races', label: 'Races' },
  { href: '/settings', label: 'Settings' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col gap-1 border-r border-white/10 bg-surface p-4">
        <span className="mb-4 px-2 text-label uppercase tracking-widest text-accent">IronFlow</span>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-control px-3 py-2 text-body transition-colors duration-150',
              pathname === item.href ? 'bg-raised text-text' : 'text-muted hover:text-text',
            )}
          >
            {item.label}
          </Link>
        ))}
        <span
          aria-disabled
          className="pointer-events-none mt-1 rounded-control px-3 py-2 text-body text-muted opacity-50"
        >
          Coach · Coming soon
        </span>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}

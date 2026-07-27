'use client';

import { cn } from '@ironflow/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ConsentGate } from './ConsentGate';

type IconKey = 'today' | 'calendar' | 'activities' | 'analytics' | 'races' | 'settings' | 'coach';

const NAV: { href: string; label: string; icon: IconKey }[] = [
  { href: '/today', label: 'Today', icon: 'today' },
  { href: '/calendar', label: 'Calendar', icon: 'calendar' },
  { href: '/activities', label: 'Activities', icon: 'activities' },
  { href: '/analytics', label: 'Analytics', icon: 'analytics' },
  { href: '/races', label: 'Races', icon: 'races' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

function Icon({ name }: { name: IconKey }) {
  const paths: Record<IconKey, ReactNode> = {
    today: (
      <>
        <circle cx="10" cy="10" r="7" />
        <circle cx="10" cy="10" r="2.4" fill="currentColor" stroke="none" />
      </>
    ),
    calendar: (
      <>
        <rect x="3.5" y="4.5" width="13" height="12" rx="2" />
        <path d="M3.5 8h13M7 3v3M13 3v3" />
      </>
    ),
    activities: <path d="M3 11h2.6l1.7-5 2.8 9 1.8-6 1.3 2h3.5" />,
    analytics: (
      <>
        <path d="M4 16.5V10M9.3 16.5V5.5M14.6 16.5V8.5" />
        <path d="M3.4 16.5h13.2" opacity="0.5" />
      </>
    ),
    races: <path d="M5.5 3v14M5.5 3.8h9l-2 3 2 3h-9" />,
    settings: (
      <>
        <path d="M3.5 7h7.5M15 7h1.5M3.5 13h1.5M9 13h7.5" />
        <circle cx="12.5" cy="7" r="2" fill="#0d1018" />
        <circle cx="7" cy="13" r="2" fill="#0d1018" />
      </>
    ),
    coach: (
      <>
        <circle cx="7.5" cy="7" r="2.6" />
        <path d="M3 16v-1a4.5 4.5 0 0 1 9 0v1" />
        <path d="M13 8.5a2.2 2.2 0 1 0 0-3.4M14 16v-1a4 4 0 0 0-1.4-3" opacity="0.55" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
      {paths[name]}
    </svg>
  );
}

/**
 * Coach mode is v2 (01-PRODUCT.md: "coach-mode UI is scaffolded-but-disabled, but no coach
 * features ship in v1"), and 08-ROADMAP.md Phase 8 requires the scaffolding to be visible.
 *
 * 06-UX.md §3 specifies it exactly: "a dimmed `Coach · Coming soon` entry (`aria-disabled`, 50%
 * opacity, no pointer events)". A `<span>` rather than a disabled `<Link>` — there is nowhere to
 * navigate to, and a link that goes nowhere is still focusable and still announced as a link.
 */
function CoachNavItem() {
  return (
    <span
      aria-disabled="true"
      className="group relative flex cursor-default items-center gap-3 rounded-control px-3 py-2 text-body text-muted opacity-50 [pointer-events:none]"
    >
      <span className="text-faint">
        <Icon name="coach" />
      </span>
      Coach
      <span className="ml-auto text-label text-faint">Coming soon</span>
    </span>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span
        className="relative grid h-8 w-8 place-items-center rounded-[10px] shadow-[0_6px_18px_-6px_rgba(124,108,245,0.8)]"
        style={{ background: 'linear-gradient(145deg, #7C6CF5, #6D8BFF 45%, #34E0C8)' }}
        aria-hidden
      >
        <svg viewBox="0 0 20 20" fill="none" stroke="#0b0d14" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]">
          <path d="M3 11h3l2-6 3.5 11 2-9 1.5 4H17" />
        </svg>
      </span>
      <span className="text-label font-semibold uppercase tracking-widest text-text">TriFlow</span>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen">
      {/* Blocks the app while consent is outstanding — there is no lawful basis to show a plan
          built from health data until it is given (§7). Renders nothing in the normal case. */}
      <ConsentGate />
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 p-3 md:block">
        <div className="glass-raised flex h-full flex-col gap-6 rounded-sheet p-4">
          <div className="pt-2">
            <Brand />
          </div>

          <nav className="flex flex-1 flex-col gap-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'group relative flex items-center gap-3 rounded-control px-3 py-2 text-body transition-all duration-150 ease-standard',
                    active
                      ? 'bg-white/[0.07] text-text shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]'
                      : 'text-muted hover:bg-white/[0.04] hover:text-text',
                  )}
                >
                  {active ? (
                    <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-accent shadow-[0_0_10px_rgba(109,139,255,0.8)]" aria-hidden />
                  ) : null}
                  <span className={cn('transition-colors', active ? 'text-accent' : 'text-faint group-hover:text-muted')}>
                    <Icon name={item.icon} />
                  </span>
                  {item.label}
                </Link>
              );
            })}
            <CoachNavItem />
          </nav>

          <div className="flex flex-col gap-3">
            <div className="hairline" />
            <div className="flex items-center gap-2.5 rounded-control px-2 py-1.5 text-label text-faint">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white/[0.06] text-muted">SA</span>
              <div className="flex flex-col leading-tight">
                <span className="text-muted">Sample athlete</span>
                <span className="text-faint">Self-coached</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-5 pb-28 pt-6 sm:px-8 md:pb-6 lg:px-12">
        <div className="mx-auto w-full max-w-[1180px]">{children}</div>
      </main>

      {/* Mobile: a floating glass tab bar (the rail is hidden under md). */}
      <nav className="fixed inset-x-0 bottom-0 z-40 md:hidden">
        <div className="glass-raised mx-3 mb-3 flex items-center justify-around rounded-sheet px-1 py-2">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 rounded-control py-1 text-[10px] font-medium transition-colors',
                  active ? 'text-accent-bright' : 'text-faint',
                )}
              >
                <Icon name={item.icon} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

// IronFlow design tokens as a Tailwind preset (06-UX.md §2). Single source of truth;
// consumed by apps/web's tailwind.config and applied to packages/ui components.

/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        bg: '#0B0E14',
        surface: '#141821',
        raised: '#1C2130',
        text: '#E8EBF0',
        muted: '#8A93A6',
        faint: '#5A6376',
        accent: '#3B82F6',
        zone: { z1: '#64748B', z2: '#22C55E', z3: '#EAB308', z4: '#F97316', z5: '#EF4444' },
        sport: { run: '#F97316', bike: '#3B82F6', swim: '#06B6D4', strength: '#A855F7' },
        ok: '#22C55E',
        warn: '#EAB308',
        risk: '#EF4444',
        // confidence states (06-UX.md §2; bands from 03-ALGORITHM.md §2.4)
        confidence: { high: '#22C55E', medium: '#EAB308', low: '#F97316', none: '#5A6376' },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        display: ['32px', { lineHeight: '1.15', fontWeight: '600' }],
        h1: ['24px', { lineHeight: '1.2', fontWeight: '600' }],
        h2: ['18px', { lineHeight: '1.3', fontWeight: '600' }],
        body: ['15px', { lineHeight: '1.5', fontWeight: '400' }],
        label: ['13px', { lineHeight: '1.4', fontWeight: '500' }],
        mono: ['14px', { lineHeight: '1.4', fontWeight: '500' }],
      },
      borderRadius: { control: '8px', card: '12px', sheet: '16px' },
      transitionTimingFunction: { standard: 'cubic-bezier(0, 0, 0.2, 1)' },
    },
  },
};

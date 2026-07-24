// IronFlow design tokens — "Instrument glass" (see apps/web/DESIGN.md). Single source of
// truth; consumed by apps/web's tailwind.config and applied to packages/ui components.
// A near-black cool ground, frosted-glass panels, one periwinkle-indigo accent, an aurora
// gradient reserved for the brandmark and the readiness ring.

/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        // Grounds — near-black with a faint indigo bias (chosen neutral, not default grey).
        bg: '#06070A',
        'bg-elev': '#0B0D14',
        surface: '#0E111A', // opaque fallback where glass can't be used
        raised: '#151926',
        // Text
        text: '#EAECF2',
        muted: '#98A2B6',
        faint: '#616B7E',
        // Accent — periwinkle-indigo. Aurora endpoints for the brand gradient.
        accent: '#6D8BFF',
        'accent-bright': '#8AA0FF',
        'accent-dim': '#4E63C4',
        aurora: { from: '#7C6CF5', via: '#6D8BFF', to: '#34E0C8' },
        // Semantic state — luminous, dark-tuned. Separate from the accent (06-UX §2).
        ok: '#35D6A4',
        warn: '#F4B740',
        risk: '#FF6B7A',
        // 5-zone (easy → max) and 3-zone roll-up borrow z1/z3/z5 (03-ALGORITHM §3).
        zone: { z1: '#6B7A90', z2: '#35D6A4', z3: '#F4B740', z4: '#FB8B4C', z5: '#FF6B7A' },
        // Sport hues — kept distinct from the accent (bike is a brighter sky blue).
        sport: { run: '#FB8B4C', bike: '#4CA6FF', swim: '#34E0C8', strength: '#B07CFF' },
        // Confidence bands (03-ALGORITHM §2.4)
        confidence: { high: '#35D6A4', medium: '#F4B740', low: '#FB8B4C', none: '#616B7E' },
      },
      fontFamily: {
        sans: [
          'var(--font-inter)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: ['var(--font-mono)', 'ui-monospace', 'JetBrains Mono', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        display: ['34px', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '600' }],
        h1: ['24px', { lineHeight: '1.15', letterSpacing: '-0.015em', fontWeight: '600' }],
        h2: ['17px', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        body: ['15px', { lineHeight: '1.55', fontWeight: '400' }],
        label: ['12.5px', { lineHeight: '1.4', fontWeight: '500' }],
        mono: ['13.5px', { lineHeight: '1.4', fontWeight: '500' }],
        stat: ['52px', { lineHeight: '1', letterSpacing: '-0.03em', fontWeight: '650' }],
      },
      letterSpacing: { widest: '0.18em' },
      borderRadius: { control: '10px', card: '16px', sheet: '20px' },
      boxShadow: {
        // Panel lift + a crisp top-highlight to sell the glass edge.
        glass: '0 24px 50px -28px rgba(0,0,0,0.75), 0 1px 0 0 rgba(255,255,255,0.07) inset',
        'glass-raised': '0 30px 60px -30px rgba(0,0,0,0.85), 0 1px 0 0 rgba(255,255,255,0.10) inset',
        glow: '0 0 0 1px rgba(109,139,255,0.35), 0 8px 30px -8px rgba(109,139,255,0.45)',
      },
      backdropBlur: { panel: '20px' },
      transitionTimingFunction: { standard: 'cubic-bezier(0.2, 0, 0, 1)' },
      keyframes: {
        'aurora-drift': {
          '0%, 100%': { transform: 'translate3d(0,0,0) scale(1)', opacity: '0.7' },
          '50%': { transform: 'translate3d(-3%, 2%, 0) scale(1.08)', opacity: '0.9' },
        },
        'fade-rise': { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'aurora-drift': 'aurora-drift 22s ease-in-out infinite',
        'fade-rise': 'fade-rise 0.5s cubic-bezier(0.2,0,0,1) both',
      },
    },
  },
};

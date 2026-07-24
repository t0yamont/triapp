/**
 * lib/climate.ts — the ambient "readiness climate" (presentation only). It maps the engine's
 * readiness state to a background mood so the whole app quietly reflects how the athlete is
 * tracking. This tints only the aurora ground behind the glass — an accent, never the panels,
 * accent, or text, which keep the instrument identity (DESIGN.md).
 */

import type { AdaptationAction } from '@ironflow/core/physio';

export type Climate = 'primed' | 'steady' | 'strained' | 'overreached' | 'peaking';

export interface ClimateInput {
  band: 'below' | 'within' | 'above' | 'unknown';
  /** Today's adaptation — the severity signal (recovery conversion ⇒ overreached). */
  action: AdaptationAction;
  /** True in a peak/taper block. */
  peaking?: boolean;
}

/** Classify the ambient climate from readiness state (most severe first). */
export function readinessClimate({ band, action, peaking }: ClimateInput): Climate {
  if (peaking) return 'peaking';
  if (action === 'convert_week_to_recovery') return 'overreached';
  if (band === 'below') return 'strained';
  if (band === 'above') return 'primed';
  return 'steady';
}

/** Per-climate background bloom (3 radial stops) plus a readable label + indicator colour. */
export const CLIMATE_META: Record<Climate, { label: string; hint: string; dot: string; aurora: [string, string, string] }> = {
  primed: {
    label: 'Primed',
    hint: 'Fresh and ready to absorb hard work',
    dot: '#35D6A4',
    aurora: ['rgba(45,214,150,0.46)', 'rgba(52,224,200,0.30)', 'rgba(70,185,255,0.36)'],
  },
  steady: {
    label: 'Steady',
    hint: 'Tracking to plan',
    dot: '#6D8BFF',
    aurora: ['rgba(124,108,245,0.50)', 'rgba(52,224,200,0.30)', 'rgba(109,139,255,0.44)'],
  },
  strained: {
    label: 'Strained',
    hint: 'Readiness down — easing the load',
    dot: '#F4B740',
    aurora: ['rgba(244,183,64,0.44)', 'rgba(251,139,76,0.28)', 'rgba(236,120,92,0.38)'],
  },
  overreached: {
    label: 'Overreached',
    hint: 'Multi-day stress — backing right off',
    dot: '#FF6B7A',
    aurora: ['rgba(255,107,122,0.48)', 'rgba(214,88,150,0.30)', 'rgba(150,80,210,0.40)'],
  },
  peaking: {
    label: 'Peaking',
    hint: 'Sharpening for a race',
    dot: '#B07CFF',
    aurora: ['rgba(150,90,245,0.50)', 'rgba(210,96,224,0.30)', 'rgba(120,110,250,0.44)'],
  },
};

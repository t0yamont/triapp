import { CLIMATE_META, type Climate } from '../lib/climate';

/**
 * The ambient aurora ground, tinted by the athlete's readiness climate (lib/climate.ts).
 * Fixed behind everything; the frosted-glass panels refract it. Kept low-alpha so it reads
 * as an accent on the near-black ground, never a colour wash over the UI.
 */
export function AuroraBackground({ climate }: { climate: Climate }) {
  const [a, b, c] = CLIMATE_META[climate].aurora;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-[3] animate-aurora-drift"
      style={{
        background:
          `radial-gradient(48% 52% at 10% 2%, ${a}, transparent 66%),` +
          `radial-gradient(46% 50% at 96% 26%, ${b}, transparent 68%),` +
          `radial-gradient(70% 65% at 72% 112%, ${c}, transparent 70%),` +
          `radial-gradient(40% 44% at 50% 48%, ${a.replace(/0\.\d+\)/, '0.12)')}, transparent 72%)`,
        filter: 'blur(8px)',
      }}
    />
  );
}

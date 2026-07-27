/**
 * "You are looking at the sample athlete, not yourself."
 *
 * Today has said this since it was built. Analytics, Races and Calendar substituted the sample
 * silently — so a new athlete saw someone else's fitness curve, races and week with nothing
 * anywhere saying whose they were. The fallback itself is right: an empty dashboard teaches
 * nothing about what the app does. Not labelling it is what made it dishonest.
 */
export function SampleDataBadge({ live, what }: { live: boolean; what: string }) {
  return (
    <span className="inline-flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-label text-muted backdrop-blur-sm">
      <span
        className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-accent shadow-[0_0_8px_rgba(109,139,255,0.9)]' : 'bg-faint'}`}
        aria-hidden
      />
      {live ? `Your ${what}` : `Preview · sample athlete until you have ${what}`}
    </span>
  );
}

# DESIGN.md — TriFlow web ("Instrument glass")

Durable visual system for the TriFlow web app. Mode: **Operate**. Product truth lives in
PRODUCT.md; this file owns the look.

## Direction contract

**THESIS.** TriFlow is a scientific instrument, so the interface is a calm mission console,
not a lifestyle app. It refuses the flat-card admin dashboard and the loud gradient-hero SaaS
page. Depth comes from *material* — frosted glass floating over a near-black aurora ground —
never from decoration.

**OWN-WORLD.** Near-black cool ground (#06070A) with a faint hairline grid and a slow,
low-alpha aurora bloom (violet→cyan) behind everything. Content sits on **frosted-glass
panels**: a translucent white fill, a 1px top-highlight border that catches light, backdrop
blur, and a soft drop shadow for lift. Data is set in tabular mono; labels are small, upper,
tracked. One cold **periwinkle-indigo accent (#6D8BFF)**; an **aurora gradient
(#7C6CF5→#34E0C8)** reserved for the brand mark and the readiness ring only. Recognizable with
all content removed: black glass, thin light edges, a single cool glow.

**STORY.** The athlete opens Today, reads *today's decision and its one-line reason* and their
readiness at a glance, trusts it (confidence is always shown), and acts.

**FIRST VIEWPORT.** Glass nav rail left with the aurora brandmark; main grid of glass panels —
today's session (with any adaptation banner) leading at large scale, the readiness instrument
(a gradient ring + component gauges) to the right, the week strip and attention below.

**FORM.** Operate console; workhorse system type, instrument-grade data treatment. Brief-pinned
world (user: dark + glass + modern), rendered as flight-deck instrument glass. Direction inferred
after the user declined the picker and said continue.

## Tokens (durable rules; exact values in tailwind-preset.mjs)

- **Grounds:** `bg` #06070A base, `bg-elev` #0B0D14. Neutrals carry a faint indigo bias — chosen,
  not default grey.
- **Glass:** panels use the `.glass` / `.glass-raised` utilities (translucent fill + `backdrop-blur`
  + top-highlight border + lift shadow). Never a flat opaque card on the main surfaces.
- **Text:** `text` #EAECF2, `muted` #98A2B6, `faint` #616B7E.
- **Accent:** `accent` #6D8BFF (interactive/focus/active), `accent-bright` #8AA0FF (hover). The
  aurora gradient is brand-only, not a UI background.
- **Semantic (dark-tuned, luminous):** `ok` #35D6A4, `warn` #F4B740, `risk` #FF6B7A. Distinct from
  the accent and from the zone/sport hues.
- **Radii:** control 10, card 16, sheet 20, pill 999. **Motion:** 150–200ms standard ease; one
  slow ambient aurora drift; everything respects `prefers-reduced-motion`.

## Rules

- Confidence travels with every physiological number (`ConfidenceDot`) — never a bare score.
- Semantic state color ≠ accent. Zones z1–z5 and sport hues are their own scales.
- Presentation only — every value comes from `@ironflow/core/physio`.
- Contrast legible in a dark room; visible focus ring (accent); reduced-motion honored.
- The faint hairline **grid** on the ground is intentional and native to this world — a
  telemetry/measurement surface (mission-console THESIS), not decorative slop. It stays very
  low-alpha and masked so it reads as atmosphere. (Overrides the detector's advisory
  `codex-grid-background`, per the world's own materials.)

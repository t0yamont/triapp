# PRODUCT.md — TriFlow (web app)

Product truth for the TriFlow web surface. Owns *what is true*, not how it looks
(that is DESIGN.md). See `/spec` for the full specification.

## Mechanism (one sentence)

TriFlow is an adaptive multi-sport endurance training platform whose **pure physiology
engine is the product**: it detects an athlete's thresholds, builds a periodised plan under
hard safety guardrails, and adapts it daily from readiness signals — every number it shows
carries a confidence and a provenance, and every plan change is audited with a reason the
athlete understands.

## Audience & scene

- **Who:** serious age-group triathletes and endurance runners/cyclists (and, later, their
  coaches). Data-literate; they already wear an HRV/GPS device and read their own numbers.
- **Scene:** checked on a phone at 5:45am before a session to see *what am I doing today and
  should I*, and studied on a laptop when planning a training block. Low light, often tired.
- **Emotional register:** trust and calm authority. This is a tool that makes a consequential
  call (train hard / ease off) and must show its reasoning, never hand-wave.

## Surfaces & their job (mode: Operate)

- **Today (default):** today's session + why, readiness (score *with* its components), the
  week at a glance, and an Attention lane that appears only when something is true.
- **Calendar / Activities / Analytics / Races / Settings:** planned (this pass focuses on
  Today + the shell + shared components).

Success = the athlete grasps *today's decision and its reason* in seconds, and trusts it.

## Non-negotiables (brand & product commitments)

- **The number and its confidence are inseparable** (`ConfidenceDot` everywhere a physiological
  number appears). Never show a bare score.
- **Dark-first.** Used pre-dawn and post-session; a dark ground is the physical answer, not a
  default. (User has pinned dark + glass/transparency, modern.)
- Semantic state color (ready / caution / stop) is distinct from the brand accent.
- Presentation only: every value on screen is computed by `@ironflow/core/physio`. The app
  never contains a formula.
- Accessible: legible contrast in a dark room, visible focus, `prefers-reduced-motion` honored.

## Constraints

- Next.js 15 App Router + React 19; Tailwind with the `@ironflow/config` token preset;
  shared components in `packages/ui`. Self-hosted fonts (CSP-safe), no external CDNs.
- Runs with or without a live Supabase connection; Today currently renders a clearly-labelled
  representative athlete until a plan is generated and a device connected.

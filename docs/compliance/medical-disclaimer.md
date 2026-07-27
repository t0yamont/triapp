# Medical disclaimer

`spec/02-ARCHITECTURE.md` §7: "Medical disclaimer shown at onboarding and in settings: TriFlow
provides training guidance, not medical advice; athletes should seek medical clearance before
beginning a training programme."

## The wording

Shown at onboarding as a checkbox that must be ticked to continue, and repeated in
**Settings → Your data**:

> I understand TriFlow provides training guidance, not medical advice, and that I should seek
> medical clearance before beginning a training programme.

Acknowledgement is recorded in `profiles.medical_disclaimer_ack_at`. It is not separately
versioned; if the disclaimer changes materially, bump `CONSENT_VERSION` — that re-prompts for both
the disclaimer and health-data consent together, which is the honest thing to do since they are
presented together.

## Where it appears

| Surface | File |
|---|---|
| Onboarding, step 3 — blocking checkbox | `apps/web/app/onboarding/about/page.tsx` |
| Re-consent dialog, when it is missing | `apps/web/components/ConsentGate.tsx` |
| Settings → Your data | `apps/web/components/settings/PrivacyCard.tsx` |

## Why the product is careful here, beyond the checkbox

A disclaimer is the least of it. The behaviours below are the substantive version of the same
commitment, and they are enforced in the engine rather than in copy:

- **Illness and injury are handled as restrictions, not adjustments.** `readiness/return.ts`
  implements §10.4: reported illness restricts training and the return is staged, rather than the
  plan simply being made a bit easier.
- **Adaptation is downgrade-only.** A poor readiness score can lower today's intensity; nothing in
  the daily path can raise it. An athlete who feels terrible is never told to go harder.
- **Guardrails cap what a plan may contain** — ramp rate, consecutive hard days, high-intensity
  fraction, weekly hours ceiling, long-session growth, post-race recovery. These are hard limits,
  validated again on the way to the database.
- **Every estimate carries its confidence and where it came from.** Low confidence makes the plan
  more conservative and schedules a test sooner, instead of presenting a guess as a measurement.

## What TriFlow must never claim

- That it can diagnose, treat or rule out any condition.
- That any reading (HRV, resting heart rate, sleep) indicates a medical problem or its absence.
- That its guidance replaces clearance from a clinician.

It is not a medical device and must not be described as one in marketing, in-app copy, or store
listings.

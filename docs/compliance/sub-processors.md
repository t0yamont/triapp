# Sub-processors

`spec/02-ARCHITECTURE.md` §7 requires "a privacy policy naming every sub-processor (Supabase,
Vercel, each provider)". This is that list. It is part of the compliance pack rather than an
appendix to it: a sub-processor added without appearing here is a breach of the policy we publish.

**Rule:** nothing that touches personal data ships without an entry here and a signed DPA.

## Active

| Sub-processor | What it does | Personal data it sees | Region | DPA |
|---|---|---|---|---|
| **Supabase** | Postgres database, authentication, file storage, Edge Functions, secrets (Vault) | All of it — profile, activities, streams, wellness, plans, credentials | ‹TO BE CONFIRMED — must be EU/UK› | ‹TO BE SIGNED› |
| **Vercel** | Hosts and serves the web application, runs its server routes | Data in transit; request logs (IP, user agent). No training data at rest | ‹TO BE CONFIRMED — must be EU/UK› | ‹TO BE SIGNED› |

## Provider connections — only when the athlete connects one

Each is a *separate* explicit consent at the point of connection, not part of sign-up. Data flows
in from these; nothing is sent back except workouts the athlete asked us to push to their device.

| Provider | Status | Data received | Notes |
|---|---|---|---|
| **Garmin** | Planned (P0) | Activities, activity streams, resting HR, HRV, sleep | Health API + Activity API in; Training API out for pushing workouts. Requires partner credentials |
| **Strava** | Planned | Activities | Terms review outstanding — flagged in the roadmap; must clear before shipping |
| **Apple Health** | Planned (mobile) | HRV, sleep, resting HR | On-device; data leaves the phone only to reach our database |
| **Wahoo / Polar / Suunto** | Out of scope for v1 | — | Present in the schema's provider enum; no integration built |
| **Manual entry / FIT upload** | Available | Whatever the athlete enters or uploads | No third party involved |

## Not sub-processors

- **Analytics / advertising:** none. There is no third-party analytics, no advertising SDK and no
  tracking pixel in the application.
- **Email:** ‹TO BE COMPLETED if transactional email is added — it would be a sub-processor›.

## Changing this list

1. Add the entry here **before** the integration merges.
2. Sign the DPA and record it in the table.
3. Confirm the region and the transfer mechanism.
4. If the change materially alters what happens to health data, bump `CONSENT_VERSION` in
   `packages/core/consent/policy.ts` — that re-prompts every existing athlete, which is the point.

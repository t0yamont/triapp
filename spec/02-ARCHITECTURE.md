# 02 — Architecture

## 1. Stack decision (revised)

The original spec specified simultaneous Next.js web + Expo mobile from Phase 1. You
authorised challenging this. The revision:

**Build web-first. Mobile ships in Phase 7.**

Rationale: the athlete's *execution* surface is the watch, not the phone — that is what
the Training API integration is for. The phone/desktop surface is for planning, review
and analysis, which is a better fit for a large screen. Building two clients from day one
roughly doubles UI work, forces every design decision through React Native Web's
constraints, and delays the engine — which is the actual product. A PWA covers mobile
review adequately for v1.

The monorepo structure keeps `apps/mobile` as a first-class future citizen: all logic
lives in `packages/core`, so adding the Expo app later is genuinely additive.

| Layer | Choice | Notes |
|---|---|---|
| Web | Next.js 15 (App Router) | Server components for data-heavy views |
| Hosting | Vercel | |
| Monorepo | Turborepo + pnpm | |
| DB / Auth / Storage / Realtime | Supabase (Postgres 15+) | |
| Background jobs | Supabase Edge Functions + pg_cron | FIT parsing, sync, nightly recompute |
| State | Zustand (client) + TanStack Query v5 (server state) | |
| Forms | React Hook Form + Zod | Zod schemas shared with API validation |
| Charts | ApexCharts (web); Victory Native XL when mobile lands | |
| Maps | Mapbox GL JS | |
| Styling | Tailwind CSS; NativeWind when mobile lands | |
| Dates | date-fns + date-fns-tz | Timezone handling is not optional here |
| Testing | Vitest (unit), Playwright (e2e), fast-check (property tests for `physio`) | |

**Phase 7 mobile:** Expo SDK 52+, Expo Router, React Native Reanimated 3, EAS Build.
Apple Sign In must be tested on a physical device.

## 2. Monorepo layout

```
ironflow/
├── spec/                       # this bundle, committed
├── apps/
│   ├── web/                    # Next.js
│   └── mobile/                 # Phase 7
├── packages/
│   ├── core/
│   │   ├── physio/             # THE ENGINE — pure, see 03-ALGORITHM.md §1
│   │   ├── hooks/
│   │   ├── types/
│   │   └── utils/
│   ├── api-client/             # Supabase + provider clients, the only I/O layer
│   ├── ui/                     # shared components + design tokens
│   └── config/                 # eslint, tsconfig, tailwind
├── supabase/
│   ├── migrations/
│   ├── functions/              # Edge Functions
│   └── seed/                   # synthetic athletes + golden fixtures
└── DECISIONS.md                # deviation log
```

## 3. Data flow

```
Provider (Garmin/Strava/Apple/FIT upload)
        │  webhook or scheduled pull
        ▼
Edge Function: ingest
        │  normalise → dedupe → store activity + laps
        ▼
Edge Function: parse-streams        (async, only if streams present)
        │  FIT/stream parse → activity_streams (compressed)
        ▼
Edge Function: derive               (async)
        │  load metrics, decoupling, DFA-a1 candidates, mean-max update
        ▼
Nightly job: recompute
        │  CTL/ATL/TSB, anchor reconciliation, readiness, plan validation
        ▼
Plan adaptation (if triggers fire) → plan_mutations (audit) → notification
```

**Idempotency.** Every ingest is keyed on `(provider, provider_activity_id)`. Replaying a
webhook must be a no-op. Providers do redeliver.

**Deduplication.** The same ride can arrive from Garmin *and* Strava. Dedupe on
`(athlete_id, sport, start_time ±120 s, duration ±3%)`. Keep the richest source
(most streams), record the others in `activity_sources`, never delete silently.

## 4. Timezone handling

The most common source of subtle bugs in training software.

- Store all timestamps as `timestamptz` (UTC).
- Store the athlete's IANA timezone on the profile, and the *activity's* local timezone
  offset on each activity.
- "Today", "this week", "this training week" are always computed in the athlete's
  current local timezone.
- Training weeks start on the athlete's configured week-start day (default Monday).
- Tests must cover: DST transitions, travel across timezones mid-week, and an activity
  recorded in a different zone from the athlete's home zone.

## 5. Performance

- **Never load streams in a list view.** Activity lists read summary columns only.
- Streams stored compressed (zstd) as typed arrays, lazy-fetched on detail view,
  downsampled server-side for charts (target ≤2000 points per series).
- Nightly recompute is incremental: only recompute derived metrics from the earliest
  changed activity forward.
- Mean-max curves cached per athlete per sport, invalidated on new activity.
- Historical backfill (up to 2 years) runs as a queued job with progress reporting, never
  blocking onboarding.

## 6. Security

- RLS on every table. Policy pattern: `athlete_id = auth.uid()`, plus a coach-relationship
  policy that is present but returns no rows until coach mode ships.
- Service-role key is server-only. Never in `apps/web/app/**` client components, never in
  `NEXT_PUBLIC_*`.
- Provider OAuth tokens encrypted at rest via Supabase Vault, never returned to the client.
- Webhook endpoints verify provider signatures before processing.
- Rate limit per athlete on sync-triggering endpoints.

## 7. Compliance (required for D1 — product-ready day one)

Health and fitness data is **special-category personal data** under UK and EU GDPR.
This is not optional polish.

- **Lawful basis:** explicit consent, collected separately for (a) processing health data,
  (b) each provider connection. Consent is versioned and timestamped.
- **Data minimisation:** do not ingest provider fields the engine does not use.
- **Right of access:** self-service full export (JSON + original FIT files) from settings.
- **Right to erasure:** self-service hard delete that cascades and revokes provider tokens.
  Must complete within 30 days and be verifiable.
- **Records of processing** and a privacy policy naming every sub-processor
  (Supabase, Vercel, each provider).
- **Data residency:** choose EU/UK Supabase and Vercel regions from the start; migrating
  later is painful.
- **Breach process** documented before launch.
- **Medical disclaimer** shown at onboarding and in settings: IronFlow provides training
  guidance, not medical advice; athletes should seek medical clearance before beginning
  a training programme.
- **Age gate:** 16+ (UK GDPR age of consent for information society services).

## 8. Observability

- Structured logging on every Edge Function with `athlete_id`, `job`, `duration_ms`,
  `outcome`.
- Sync health dashboard: per-provider success rate, median latency, backlog depth.
- **Engine decision log:** every plan mutation records inputs, rule fired, and output.
  When an athlete asks "why did my Thursday change", this table is the answer. Retain
  indefinitely; it is small and it is the product's credibility.
- Alert on: sync failure rate >5% over 1 h, nightly recompute failure, any guardrail
  violation reaching the persistence layer (should be impossible — if it fires, there
  is a bug).

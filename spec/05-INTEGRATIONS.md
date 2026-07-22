# 05 — Integrations

## 1. Provider strategy

| Provider | Data in | Workouts out | Priority | Notes |
|---|---|---|---|---|
| **Garmin** | Health API + Activity API | **Training API** | P0 | The flagship. Only provider covering both directions well |
| FIT/GPX upload | Yes | n/a | P0 | Ships day one. Unblocks development and covers every device |
| Apple Health | Yes (iOS) | No | P1 | Phase 7 with the mobile app |
| Strava | Yes | No | P2 | **See §4 — terms constrain what you may build** |
| Wahoo | Yes | Partial | P3 | |
| Polar | Yes (AccessLink) | Partial | P3 | |
| Suunto | Yes | No | P3 | |

## 2. Garmin — the two-path plan

Garmin Connect Developer Program access requires an approved application and, in
practice, a business entity. Approval is not instant and the Training API is a **separate
grant** from the Health/Activity APIs. Build so that approval is a switch, not a rewrite.

### Path A — development (available immediately)

Two sources, both real data, neither requiring approval:

1. **FIT/TCX/GPX upload.** Garmin Connect lets a user export their full history. Build
   the parser first; it is needed regardless and it is the permanent fallback for users
   on unsupported devices.
2. **Garmin MCP connector (development only).** A connected MCP server can pull real
   activity history into a development environment for building fixtures and validating
   the engine against genuine data.

**MCP is explicitly not a production sync path.** No webhooks, no multi-tenant OAuth, no
SLA, and it introduces a third-party dependency between you and your users' data. Use it
to generate `supabase/seed/` fixtures, then never again.

### Path B — production (post-approval)

- **Health API** — daily wellness: sleep, resting HR, HRV, body battery, stress. Feeds
  the readiness model (`03-ALGORITHM.md` §10).
- **Activity API** — activity summaries and details, delivered by push notification
  within seconds of the user syncing, rather than polled.
- **Training API** — publishes structured workouts and training plans to the user's
  Garmin Connect calendar; the user's device picks them up on next sync. This is the
  execution surface.

**Implementation notes:**
- OAuth 2.0 with PKCE. Tokens in Supabase Vault, referenced by ID, never returned to
  the client.
- Register push/webhook endpoints and verify signatures. Handle redelivery idempotently.
- Backfill: request historical data as a queued job with progress reporting; do not
  block onboarding on it.
- Note Garmin's ecosystem constraints: some categories (notably strength) have limited
  third-party write support, and some premium metrics carry licence terms for commercial
  use. Confirm current terms at integration time rather than assuming.

## 3. Workout push — feature design

```
Plan generated
  → workout.structure (canonical JSON, §5)
  → adapter per provider
      ├── Garmin Training API  → publish, store device_workout_id
      └── fallback             → generate .FIT workout file for manual import
  → mark pushed_to_device_at
  → on plan mutation, republish or delete-and-republish
```

**Rules:**
- Push a rolling window of the next 10 days only. Pushing a whole plan means every
  adaptation triggers a bulk rewrite.
- Every plan mutation that changes a pushed workout must republish it. A stale workout on
  the watch is worse than no workout.
- If push fails, degrade to the FIT download path and tell the athlete plainly.
- Targets are pushed in every modality the athlete's device supports (HR zone + pace or
  power range), with HR as the guaranteed fallback.

## 4. Strava — read the terms before scoping

Strava's API agreement has been materially tightened. The constraints that matter for
IronFlow:

- Data obtained from Strava may generally only be displayed to the athlete who owns it —
  which conflicts with any coach-view feature over Strava-sourced data.
- Using Strava data to train or improve machine-learning models is prohibited.
- There are limits on replicating Strava's own UI surfaces.

**Design consequence:** treat Strava as a *supplementary* import only. Never make a core
feature depend on it, never route Strava-sourced data into coach views, and keep the
provenance flag on every activity so that provider-specific restrictions can be enforced
at query time. Verify current terms before building — they have changed more than once.

## 5. Canonical workout structure JSON

One shape, translated per provider. This is the contract between the engine and every
execution surface.

```jsonc
{
  "version": 1,
  "sport": "bike",
  "name": "VO2max 3×13×30/15",
  "purpose": "vo2max",
  "goalZone": "S3",
  "estimatedDurationMin": 75,
  "estimatedLoad": 92,
  "steps": [
    {
      "type": "step",
      "intent": "warmup",
      "duration": { "type": "time", "seconds": 900 },
      "target": { "type": "hr_zone", "zone": 2 }
    },
    {
      "type": "repeat",
      "count": 3,
      "steps": [
        {
          "type": "repeat",
          "count": 13,
          "steps": [
            { "type": "step", "intent": "interval",
              "duration": { "type": "time", "seconds": 30 },
              "target": { "type": "power_range", "lowWatts": 340, "highWatts": 380 } },
            { "type": "step", "intent": "recovery",
              "duration": { "type": "time", "seconds": 15 },
              "target": { "type": "power_range", "lowWatts": 180, "highWatts": 220 } }
          ]
        },
        { "type": "step", "intent": "recovery",
          "duration": { "type": "time", "seconds": 180 },
          "target": { "type": "hr_zone", "zone": 1 } }
      ]
    },
    {
      "type": "step", "intent": "cooldown",
      "duration": { "type": "time", "seconds": 600 },
      "target": { "type": "hr_zone", "zone": 1 }
    }
  ],
  "notes": "Ride the 15s recoveries — they are not rest. Hold the last set."
}
```

**Target types:** `hr_zone`, `hr_range`, `power_range`, `pace_range`, `open`, `rpe`.
Always emit at least two where the data supports it, ordered by preference, so a device
without power still gets a usable prescription.

## 6. Fuelling handoff contract (D14)

IronFlow does not compute nutrition. It exposes, per session:

```jsonc
{
  "sessionId": "uuid",
  "sport": "bike",
  "scheduledAt": "2026-08-14T06:00:00Z",
  "durationMin": 240,
  "intensity": { "goalZone": "S2", "estimatedIF": 0.68 },
  "estimatedEnergyKj": 3400,
  "elevationGainM": 1200,
  "expectedConditions": { "tempC": 27, "humidityPct": 60 },
  "isRaceSimulation": true
}
```

and accepts back an optional `{ sessionId, carbsPerHourG, fluidPerHourMl, sodiumPerHourMg,
notes }` which is **displayed only** and never enters the training algorithm.

## 7. Deduplication

Same activity, multiple providers. Match on:
`same athlete` AND `same sport` AND `start_time within ±120 s` AND `duration within ±3%`.

Keep the richest record (most streams, highest sample rate, RR intervals present wins),
record every source in `activity_sources`, set `is_duplicate_of` on the losers, and never
hard-delete — a user reconnecting a provider should not lose history.

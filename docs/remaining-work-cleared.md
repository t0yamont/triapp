# Clearing the backlog — 27 July 2026

Session task: "compliance aside, what's left" → "do everything". Built under the ponytail
constraint: the laziest solution that actually works, reuse before addition, one runnable check
behind every non-trivial piece.

**Result:** 702 tests green (511 engine at 100% branch coverage, 153 api-client, 38 web, 10 E2E),
typecheck clean, web app builds.

---

## 1. The nightly recompute — the one that was blocking everything else

`20260722120300_scheduled_jobs.sql` had been POSTing to `/recompute` hourly since the schema
landed. No such function existed. The consequence was much larger than a 404: **nothing in the
codebase ever wrote `ctl_total`, `atl_total`, `tsb_total`, `ctl_by_sport`, `daily_load`,
`monotony` or `strain`, and `mean_max_curves` had no writer at all.** Phase 4 built the maths and
nothing ran it.

So: the fitness chart recomputed CTL in the browser from *planned* load on every page load, a new
plan could not be seeded from measured fitness, and G7/G8 had no persisted history to check against.

The job is the same shape as `ingest` — a thin Deno shell over typechecked, tested package code.
Three things it gets right deliberately:

- **Dense day arrays.** `fitnessSeries` decays per element, so a gap-compressed array decays per
  *session* and inflates CTL for anyone training intermittently. Rest days are present at zero.
- **Local dates.** A 6am ride in Auckland is 18:00 UTC the day before; bucketed by UTC it lands on
  the wrong day and every downstream number moves with it (hard rule 8).
- **The upsert names only derived columns**, so PostgREST's `ON CONFLICT` touches only those and
  an athlete's check-in on the same row survives the recompute untouched.

It also closes §6.3, which was inert in *both* directions — `mean_max_curves` had no writer and
`fitCriticalPower` had no caller outside its own tests. Streams were write-only: `packFloat32` and
`packInt16` existed from the first ingest and nothing ever unpacked. Curves are rebuilt per sport
and a critical-power / critical-speed anchor is written when the fit holds, superseding rather than
overwriting, and **skipped when the value has not moved** so a nightly job cannot manufacture a new
"measurement" every night out of the same efforts.

Migration 0005 re-registers the cron job with an `Authorization` header — the original sends none,
and the function bypasses RLS and so requires the service-role key. Left alone it would 401 hourly,
for ever.

## 2. Activity detail

Phase 4's "activity detail with overlay charts and lazy streams". The list page's own comment has
said "the title is the link to the session detail" since it was written, and there was no such
route. Traces were parsed, stored, and used to compute decoupling — and no screen could show one.

Lazy in the sense hard rule 6 means: the header paints from the activity row, streams are fetched
only here and only when the row says there are any. `downsample` takes the **maximum** of each
bucket, not the first sample — a three-hour ride is 10 800 points, and stride sampling drops the
30-second peak that is the reason the athlete opened the page.

## 3. Notifications

ARCH §5 states the chain — "Plan adaptation → plan_mutations (audit) → notification" — and
`notifications.plan_mutation_id` exists to carry it. Three code paths wrote the audit row; none
wrote the notification. The table had no rows, and Settings offered four toggles with no storage
column, no producer and no reader behind any of them.

All three audit writes now route through one `insertPlanMutations` that does both — the smaller
diff, since the three inserts were near-identical, and each keeps its own rollback because each has
different undo semantics.

**An athlete is never notified about their own action.** Telling someone they moved the session
they just moved is noise, and noise is what teaches people to dismiss notifications without
reading — including the one that matters, which is the engine quietly easing tomorrow.

Three kinds, each with a real producer. "Weekly summary" was deleted from Settings rather than left
as a switch that controls nothing.

## 4. E2E, and the bug it found on its first run

Phase 1 asks for a Playwright skeleton; there was none. Every other test is a unit test and not one
boots the app, so the failure class none of them can see is the app failing to render.

It ran once and found one. `TsbCard` and `DecouplingCard` both built an SVG **path** string —
shared with the fill area underneath — then handed it to `<polyline points=…>` after slicing off
the leading `M `. `points` takes bare coordinate pairs and rejects `L`, so the browser discarded
the attribute: **the Form/TSB and decoupling charts have been drawing their shaded area with no
line on top of it.** Fixed at the cause by using `<path d=…>`, which is what the string always was.

Runs against a production build, because that is where these failures appear. Two tests pin
honest-disabled states on purpose: coach mode visible and unreachable (06-UX.md §3), and onboarding
showing the 16+ gate and both consents while refusing to submit with no project behind it.

## 5. Onboarding steps 4–5

The flow went from "about you" straight to availability, so an athlete had no way to give the
engine any history and every first plan was seeded from a self-reported guess.

One screen, not two: with no provider integration, step 4's third option is "upload a history
export" and step 5 is that upload's progress. A screen whose only content is "your import is
running" would be a step that exists to match a number.

Providers are shown and disabled — they are the primary route and should be visible as coming, but
a Connect button that opened nothing would be the same lie as the export button that downloaded
nothing. `uploadActivityFile` came out of `useActivityUpload` so the single-file drop and the bulk
import take the identical server path. A re-uploaded file counts as "already had", not a failure.

## 6. The ponytail ledger, cleared

Four deferred shortcuts, each marked with its upgrade path. Three were blocked on work that has now
landed; the fourth had a lazier fix than its own comment proposed.

- **Analytics reads measured fitness** from `daily_metrics`, with the planned-load fallback kept
  for an athlete the job has not run for yet. A day the job has not written holds its previous
  value rather than dropping to zero, which would read as a collapse that never happened.
- **The week strip shows what a session cost**, from the linked activity. Reporting the planned
  figure for a session the athlete cut short is the bar claiming work that never happened.
- **Readiness adaptation applies its week half.** `weekLoadDeltaPct` and `suppressS3Days` were
  computed, audited and never acted on — so an athlete flagged on Tuesday had today eased and
  trained an unchanged Wednesday and Thursday, the exact pattern the rule exists to answer.
  Downgrade-only in both directions: the scale factor is clamped at 1 so a positive delta upstream
  cannot become an *increase* in someone's week.
- **A failed plan insert no longer orphans a plan header.** A part-way failure left a
  `training_plans` row with no weeks, and `getActivePlan` takes the newest — the athlete landed on
  a dashboard showing an empty plan with no way out. Deleting the header undoes all of it via the
  cascade: smaller and clearer than a plpgsql RPC, same failure removed.

---

## What is still left, and why

**Provider integration.** Garmin OAuth, webhook handling, and the provider side of the historical
backfill. Needs partner credentials. Nothing writes `integrations` or `sync_log` yet, which is why
the sync health card honestly reads "no syncs recorded yet" — the writer lands with the client.

**Mobile.** The Expo app, HealthKit, push notifications, EAS/TestFlight. Needs native tooling that
does not exist in this environment. The in-app notification half is built and the push half is the
transport over it.

**Compliance sign-offs**, unchanged from the last session: signed DPAs, controller identity, and
confirming the Vercel region on the first deploy (`vercel.json` pins `lhr1`).

---

## Verification

```
pnpm typecheck                              5/5 successful
pnpm --filter @ironflow/core test:coverage  511 tests, physio 100% branch
pnpm --filter @ironflow/api-client test     153 tests
pnpm --filter @ironflow/web test             38 tests
pnpm --filter @ironflow/web test:e2e         10 tests (PLAYWRIGHT_CHROMIUM_PATH to reuse a
                                                       pinned Chromium instead of downloading)
pnpm --filter @ironflow/web build            compiled, 17/17 pages
```

## Deploying the new pieces

```bash
supabase db push                                    # migrations 0005, 0006
supabase functions deploy recompute --no-verify-jwt # pg_cron calls it with the service key
alter database postgres set app.service_role_key = '<service_role key>';
```

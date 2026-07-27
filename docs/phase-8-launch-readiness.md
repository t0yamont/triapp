# Phase 8 — launch readiness

**Session task:** finish Phase 7 or start Phase 8. Phase 8, and it was not close.

The rest of Phase 7 is credential-gated: the Garmin HTTP client, the Expo app, HealthKit, push
notifications and the EAS/TestFlight pipeline all need partner credentials or native tooling that
does not exist here. Writing an unverifiable Garmin client would mean guessing at an API contract,
which `CLAUDE.md` explicitly forbids. Phase 8 is buildable, testable, and **legally blocking** —
health data is special-category personal data, and the rights below are obligations, not features.

**State on arrival:** 490 engine tests, Phase 7's FIT workout export and device push policy landed.
**State now:** 670 tests across the workspace (511 engine at 100% branch coverage, 121 api-client,
38 web), typecheck clean, web app builds.

---

## Phase 8 checklist

| Roadmap item | State |
|---|---|
| Data export and hard delete, self-service | **Done** — §1 |
| Consent versioning verified | **Done** — §2 |
| Privacy policy, sub-processor list, medical disclaimer | **Drafted** — §5, needs legal review |
| Observability: sync dashboard, engine decision log, alerting | **Done** — §3 |
| 12-week simulated season, 20 athletes, zero guardrail violations | Done in a previous session (`season.test.ts`) |
| Performance pass | **Plan generation done and measured**; dashboard p95 needs RUM — §4 |
| Coach mode scaffolding visible and disabled | **Done** — §4 |

---

## 1. Right of access and right to erasure

`02-ARCHITECTURE.md` §7 requires a self-service export and a self-service hard delete that
"cascades and revokes provider tokens… must complete within 30 days and be verifiable".

Settings carried an **Export my data** button wired to nothing, and no delete at all. A button that
looks like a working right is worse than no button.

### The export

`exportAthleteData` reads all 21 personal-data tables. Three things the schema made non-obvious,
each of which produces an export that looks complete and is not:

- **Child tables carry no `athlete_id`.** `activity_sources`, `activity_laps`, `activity_streams`
  and `plan_weeks` are reachable only through a parent, so they are fetched by the parent ids
  already read. A naive per-table query over `athlete_id` silently drops every stream and every
  planned week.
- **`coach_athlete_relationships` names two people.** Keyed only on `athlete_id`, a coach's export
  of that table comes back empty and looks correct.
- **A partial export must not be handed over.** Any table that fails to read goes in `errors`, and
  the UI refuses to download at all rather than producing a file that is missing something without
  saying so.

The guard that makes this durable is `assertExportCoversSchema`, tested against the **real
migration files** rather than a hard-coded list. A migration that adds a table holding athlete data
without a matching entry fails the test. That is a reportable breach presenting as a working
feature, and it is the only failure here that would never show up in ordinary use.

### The erasure

Reads the provider connections **first** — once the rows are gone there is nothing left to revoke
with, and a live token at a third party is exactly the data the athlete asked to have destroyed.
`integrations` stores Supabase Vault *references*, never raw tokens, so erasure returns the refs:
revoking at the provider and destroying the secret are two separate acts and both are needed.

Deletion goes through a new `/api/account` route rather than the browser, because `auth.users` is
the one thing RLS cannot reach: `profiles.id` references it, so the cascade runs the wrong way and
the athlete's email would outlive everything else. The athlete id comes from the verified access
token, never the request body.

Afterwards it **re-counts every table** and reports `verified` plus the remainder.

> **A bug this found in itself.** The first version counted `id`. Four tables —
> `athlete_availability`, `athlete_model_current`, `mean_max_curves`, `daily_metrics` — are keyed
> `(athlete_id, …)` and have no `id` column, so the count errored, and the error was read as
> `count ?? 0`: "this table is empty". Erasure would have reported `verified: true` for the four
> tables it had been unable to check. It counts the key column it is already filtering on now, and
> a failed read goes in `unreadable` instead of becoming a zero — "we could not look" and "there is
> nothing there" must not collapse into the same answer.

## 2. Consent versioning

`CONSENT_VERSION` was a local constant inside the onboarding page, and nothing ever compared it to
what an athlete had agreed to. Bumping the policy would have applied to new sign-ups only, leaving
every existing athlete processed on a basis they never accepted — which is the failure versioning
exists to prevent.

Consent is now policy in `@ironflow/core/consent`: the version, the row shape, and `consentStatus`,
which reports the specific gap (never consented / consented to a superseded version / no medical
disclaimer). `ConsentGate` blocks the app while any gap is outstanding.

It blocks rather than nags: while consent is outstanding there is no lawful basis to show a plan
built from health data. But it renders **only on a positive read** — a failed query must not lock
an athlete out of their training plan, and consent is on record in the database either way.

**The age gate was decorative.** The field carried a hint reading "(16+)" and accepted any date; an
under-16 could complete sign-up. It is enforced now, in whole calendar years rather than by the
`365.25` division the HRmax path uses — that approximation drifts by up to a day around a birthday,
which is harmless in a training formula and not harmless in a legal threshold. A 29 February
birthday reaches 16 on 1 March, matching the position in English law.

## 3. Observability

Three gaps of the same shape: the data existed and nothing looked at it.

**Engine decision log.** Three write paths have been filling `plan_mutations` for months because
hard rule 10 requires it. Nothing read them back, so the answer to "why did my Thursday change"
existed and no athlete could see it — the same as not having it. §8 calls this table "the product's
credibility". There is now a panel on Today showing the sentence the engine wrote at the time, the
stable reason code and the rule that fired.

Grouping is by the athlete's **local** day. An adaptation made at 23:30 in Auckland is a Tuesday
decision to the athlete and a Monday one in UTC, and filing an explanation under the wrong day is
where an explanation stops reassuring. That needed one tested conversion, so `CLAUDE.md` hard rule
8's "test across a DST boundary" is now covered in both directions.

**Guardrail violations reaching persistence.** §8 says to alert on this and calls it impossible. It
was *unobservable*: `validateWeek` has existed since the first commit and no write path called it,
so an engine bug would have arrived on a calendar unremarked. `insertGeneratedPlan` audits every
week first. It alerts rather than blocks — §8's own wording, and refusing the write would turn an
engine bug into an athlete with no plan at all. A real 12-week Ironman plan passes every week.

**Sync health.** Per-provider success rate, median latency and unfinished runs, plus the two sync
alert rules. Two judgement calls worth naming: an in-flight run counts as neither success nor
failure, so the rate does not lurch when a sync happens to be running as the page loads; and the
failure-rate alert needs two failures before firing, because one out of one is a 100% rate and
paging on that teaches people to ignore alerts. §8 asks for "backlog depth" — there is no job queue
to measure, so the card reports runs that started and never finished and says so, rather than
dressing up a different number.

## 4. Performance and coach mode

**Plan generation, budget 2 s.** A 24-week Ironman build measures **p50 0.67 ms, p95 1.9 ms**; a
52-week plan 1.4 ms. Roughly three orders of magnitude of headroom. The test takes a p95 over
repeated runs rather than trusting one, and separately asserts that cost stays near-linear in plan
length — a super-linear jump is the signature of an accidental O(n²) over the week list, which is
what would actually eat that headroom one day.

**The dashboard's 1.5 s p95 is deliberately not claimed.** It is dominated by network round trips,
query latency and paint, none of which exist in a unit test; asserting it here would measure
nothing and report a pass. What is measured is the engine work behind a render — validating and
summarising a whole season, under a millisecond — so if the dashboard is ever slow, this rules the
engine out. The real number needs RUM against a deployment.

**Coach mode.** `06-UX.md` §3 specifies a dimmed `Coach · Coming soon` nav entry with
`aria-disabled`, 50% opacity and no pointer events. What existed was the words "Coach · soon" in
the sidebar's profile block, which is not a nav entry. Built as specified, as a `<span>` rather
than a disabled link — there is nowhere to navigate to, and a dead link is still focusable and
still announced as a link.

## 5. The compliance pack

`docs/compliance/`: privacy policy, sub-processor list, records of processing (Art. 30), breach
process (Arts. 33–34), and the medical disclaimer.

Written to be accurate about what the software actually does rather than generic — the data
inventory comes from the schema, the rights section points at the export and delete that now exist,
the register names tables, and the breach process names the realistic failure modes for *this*
system. That accuracy is the part an external adviser cannot supply; the legal framing is the part
they must, and every document says so.

Two things the pack records rather than glosses: **the deployed Supabase and Vercel regions are not
confirmed to be EU/UK**, and **no DPA is signed**. Both are launch blockers.

---

## What is left, and why

**Phase 7's remainder** — the Garmin HTTP client, Expo mobile, HealthKit, push notifications, the
EAS/TestFlight pipeline. All need credentials or native tooling. The device push *policy* they will
wrap is already built and tested.

**Nothing writes `sync_log` yet.** The sync health card therefore shows "no syncs recorded yet",
which is the honest state; the writer lands with the provider sync.

**Legal review** of the compliance pack, signed DPAs, confirmed regions, and the controller's
registered details.

---

## Verification

```
pnpm typecheck                              5/5 successful
pnpm --filter @ironflow/core test:coverage  511 tests, physio 100% branch, consent 100%
pnpm --filter @ironflow/api-client test     121 tests
pnpm --filter @ironflow/web test             38 tests
pnpm --filter @ironflow/web build            compiled, 16/16 pages
```

## Commits

- `Phase 8: data export and verifiable erasure (§7)`
- `Phase 8: consent versioning and a real 16+ age gate (§7)`
- `Phase 8: export and erasure are actually self-service now`
- `Phase 8: observability — decision log, sync health, guardrail alerting (§8)`
- `Phase 8: performance budget and the coach-mode scaffolding (§3, roadmap)`
- `Phase 8: the compliance pack (§7)`
- `Fix erasure verification counting a column four tables do not have`

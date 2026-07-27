# TriFlow — Privacy Policy (draft)

> **Draft for legal review.** Every factual claim below is traceable to the schema and code in this
> repository; the legal framing is not a substitute for advice from a qualified data-protection
> adviser. Fields marked `‹TO BE COMPLETED›` need the controller's registered details.

**Controller:** ‹TO BE COMPLETED — registered name, address, ICO registration number›
**Contact for data protection:** ‹TO BE COMPLETED›
**Last updated:** 27 July 2026 · **Policy version:** `v1` (matches `CONSENT_VERSION` in the app)

---

## 1. In one paragraph

TriFlow builds you an endurance training plan and adapts it day to day. To do that it holds
health and fitness data about you — heart rate, heart-rate variability, sleep, how tired you say
you feel, and every session you complete. Health data gets stronger legal protection than ordinary
personal data, so we only process it with your **explicit consent**, we tell you exactly what we
hold, and you can take all of it away or have it destroyed from Settings without asking us.

## 2. What we collect

**You give us directly**

- Account: email address and password (held by our authentication provider, not by us in readable
  form), display name, date of birth, sex (optional — "prefer not to say" is a real answer), units,
  timezone, week start day.
- Training availability: which days you can train and for how long, your weekly ceiling, which days
  are your long ride and long run.
- Daily check-ins: sleep duration, how fatigued, sore, stressed you feel and your mood (1–5), plus
  flags for illness or injury and where the injury is.
- Races you enter, target times, and field-test results.

**We collect from a device or service you connect** (only after you separately consent to that
connection)

- Completed activities: sport, start time, duration, distance, elevation, heart rate, power,
  pace, cadence, swim stroke count, temperature, humidity, altitude.
- The detailed second-by-second streams behind those activities.
- Recovery signals: resting heart rate, heart-rate variability, sleep.

**We derive** (we do not receive these; the app calculates them)

- Your physiological model: threshold heart rates, critical power, critical swim speed, maximum
  and resting heart rate — each stored with a confidence value and a record of where it came from.
- Training load and fitness/fatigue balance, monotony and strain, a daily readiness score, and your
  training plan itself.

**Age.** TriFlow is for people aged 16 and over. We check your date of birth at sign-up and cannot
create an account below that age.

## 3. Why, and on what legal basis

| What we do | Why | Basis |
|---|---|---|
| Hold and analyse your health and fitness data to build and adapt your plan | It is the entire service | **Explicit consent** (Art. 9(2)(a)) |
| Hold your account and settings | To give you an account at all | Contract |
| Import from a connected provider | To avoid you typing in every session | **Separate explicit consent per provider** |
| Keep the log of every change made to your plan | So we can always tell you why your plan changed | Legitimate interests, and it is your data — you can export it |
| Keep security and error logs | To keep the service working and secure | Legitimate interests |

**Consent is versioned.** If we materially change what we do with your health data, we ask you
again, and the app stops showing you a plan until you answer. Agreeing to one version is not
agreeing to the next. You can withdraw consent at any time by deleting your account (§6).

We do **not** use your data for advertising, we do not sell it, and we do not use it to make
automated decisions with legal or similarly significant effects. The plan adapts automatically —
that is the product — but it is training guidance, not a decision about your rights.

## 4. What we deliberately do not collect

We do not ingest provider fields the engine does not use, and we do not store your provider
passwords or access tokens in our database — connection credentials are held in a separate secrets
store, and our records contain only a reference to them.

## 5. Who else sees it

Every third party that processes your data is listed, with what it does and where it runs, in
[`sub-processors.md`](./sub-processors.md). We do not share your data with anyone else. If you
choose to connect a coach in a future version, you will grant that access explicitly and be able
to revoke it.

## 6. Your rights

You can exercise the first two yourself, immediately, from **Settings → Your data**:

- **Access / portability.** "Export my data" downloads everything we hold about you as a JSON
  file, including your activity streams. If any part of it fails to read, we give you nothing and
  say so rather than handing you an incomplete file that looks complete.
- **Erasure.** "Delete my account" permanently destroys your profile, activities, streams, plans,
  metrics, race entries and provider connections, and revokes our access at every provider you
  connected. It is not a flag or an archive: the rows are deleted, and we re-count every table
  afterwards to confirm it worked. Completion is immediate, well inside the 30 days the law
  allows. It cannot be undone — export first if you want a copy.

You also have the right to rectification, to restrict or object to processing, to withdraw consent,
and to complain to the Information Commissioner's Office (ico.org.uk) or your local supervisory
authority. For anything not self-service, contact ‹TO BE COMPLETED›; we respond within one month.

## 7. How long we keep it

While your account exists, and no longer. Deleting your account deletes all of it. The one
exception is ordinary security and error logging, which is retained briefly for operational
reasons and does not contain your health data — our job logs record an account identifier, a job
name, a duration and an outcome, never your training or wellness values.

## 8. Where it is held

‹TO BE COMPLETED — confirm the deployed region› The service is designed to run in UK/EU regions
for both the database and the application, and to keep it that way; see
[`sub-processors.md`](./sub-processors.md) for each provider's location and transfer terms.

## 9. Security

Access is enforced at the database itself: every table carries row-level security, so a query can
only ever return your own rows, and this is tested rather than assumed. Provider credentials live
in a dedicated secrets store. Administrative keys are server-side only and never reach a browser.

## 10. This is not medical advice

See [`medical-disclaimer.md`](./medical-disclaimer.md). TriFlow provides training guidance. It is
not a medical device, it does not diagnose anything, and you should seek medical clearance before
beginning a training programme.

## 11. Changes

If we change how we use your health data, we will bump the policy version and ask for your consent
again in the app before continuing. Minor wording fixes will not re-prompt you — asking for consent
over a typo teaches people to click through consent screens without reading them.

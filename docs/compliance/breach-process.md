# Personal data breach process

`spec/02-ARCHITECTURE.md` §7: "Breach process documented before launch." Arts. 33–34 give **72
hours** from becoming aware of a breach to notify the supervisory authority, and require notifying
affected individuals "without undue delay" where the risk to them is high.

Because TriFlow holds special-category health data, the risk threshold for notifying athletes is
low. Assume notification is required unless there is a clear reason it is not, and write the reason
down.

**Owner:** ‹TO BE COMPLETED — named individual and deputy›
**Supervisory authority:** ICO (ico.org.uk), report via their online form or 0303 123 1113.

## What counts

Any accidental or unlawful destruction, loss, alteration, or unauthorised disclosure of or access
to personal data. Concretely, for this system:

- One athlete's data returned to another — an RLS policy regression is the realistic route.
- The service-role key leaking into client code or a public log.
- Provider credentials exposed from Vault.
- A backup or export file reaching somewhere it should not.
- Data destroyed without an erasure request (loss counts, not just disclosure).
- A sub-processor telling us they have had a breach.

A failed sync, a slow page, or a bug that shows an athlete the wrong *number* is not a breach.

## The clock

The 72 hours start when we become **aware** — meaning reasonably certain a breach has occurred,
not when the investigation finishes. Start the clock on the first credible report and note the
time. If you are unsure whether it is a breach, start the clock anyway; a clock that turns out not
to have been needed costs nothing.

## Steps

**1 · Contain (immediately).** Revoke the exposed credential, roll the affected keys, disable the
faulty policy or route. Prefer taking a feature offline over leaving it leaking. Do not delete
evidence while containing — capture logs first.

**2 · Record (immediately).** Open an incident record with: when and how we found out, what data
and how many athletes are involved, what has been done so far, and who is doing what. This record
is itself an Art. 33(5) obligation and must exist even for breaches that are not notified.

**3 · Assess (within 24 hours).** Determine scope from the audit trail, and the likely risk to
those affected. Health data raises the assessment; a disclosure of training and wellness data about
an identifiable person is high risk by default.

**4 · Notify the ICO (within 72 hours).** Nature of the breach, categories and approximate number
of data subjects and records, our contact point, likely consequences, and the measures taken.
If some facts are still unknown, **file on time with what is known** and supplement afterwards —
a late complete report is worse than an on-time partial one.

**5 · Notify affected athletes (without undue delay, where high risk).** In plain language: what
happened, what data, what we have done, what they should do, and who to contact. No hedging and no
burying it in a product update. If encryption or another measure genuinely removes the risk, record
that reasoning instead of notifying.

**6 · Notify sub-processors and partners** where their systems or credentials are implicated.

**7 · Review (within two weeks).** What made this possible, what detection would have caught it
sooner, and one concrete change. Regressions in tenant isolation should end with a test in
`supabase/tests/`, not just a fix.

## If we are the sub-processor's problem

Supabase or Vercel notifying us of a breach starts our clock at the moment they tell us. We remain
the controller and the notification duties are ours; their incident report is input, not a
substitute.

## Preventive checks already in place

- `supabase/tests/rls_isolation.sql` proves cross-tenant reads fail on every table.
- `createServiceClient` throws if it is ever constructed in a browser.
- `withJobLog` records an error's message only, so tokens and payloads do not reach logs.
- Erasure is verified by re-count, so a partial delete surfaces rather than being reported as
  success.

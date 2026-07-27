# Compliance pack — TriFlow

Phase 8 of `spec/08-ROADMAP.md` requires a privacy policy, a sub-processor list and a medical
disclaimer before launch; `spec/02-ARCHITECTURE.md` §7 adds records of processing and a documented
breach process. This directory holds all of them.

> **These are engineering drafts, not legal advice.** They are written to be *accurate about what
> the software actually does* — every claim in them is traceable to code or schema in this repo,
> and that is the part an external lawyer cannot supply. They still need review by a qualified
> data-protection adviser before they are published, and the controller's registered details,
> ICO registration number and DPO/representative contacts must be filled in where marked
> `‹TO BE COMPLETED›`.

| Document | Covers | Legal hook |
|---|---|---|
| [`privacy-policy.md`](./privacy-policy.md) | What is collected, why, on what basis, for how long, and the athlete's rights | UK/EU GDPR Arts. 13–14 |
| [`sub-processors.md`](./sub-processors.md) | Every third party that touches personal data | Art. 28; §7 "naming every sub-processor" |
| [`records-of-processing.md`](./records-of-processing.md) | The internal processing register | Art. 30 |
| [`breach-process.md`](./breach-process.md) | Who does what, in what order, inside 72 hours | Arts. 33–34 |
| [`medical-disclaimer.md`](./medical-disclaimer.md) | The exact wording shown at onboarding and in settings | §7 "medical disclaimer" |

## What is implemented, and where

The rights below are not aspirational — this is where they live in the code.

| Requirement | Implementation |
|---|---|
| Explicit, **versioned** consent | `packages/core/consent/policy.ts`; captured at `apps/web/app/onboarding/about`, re-prompted by `apps/web/components/ConsentGate.tsx` |
| Age gate, 16+ | `checkAgeEligibility` — enforced in the onboarding form, in whole calendar years |
| Right of access (export) | `exportAthleteData` in `packages/api-client/src/repositories/privacy.ts`; UI in `components/settings/PrivacyCard.tsx` |
| Right to erasure | `deleteAthleteData` + `apps/web/app/api/account/route.ts`; verifiable by re-count |
| Export completeness | `assertExportCoversSchema`, asserted against the real migrations in `privacy.test.ts` |
| Tenant isolation | RLS on all 21 tables — `supabase/migrations/20260722120200_rls_policies.sql`, proven by `supabase/tests/rls_isolation.sql` |
| Credential storage | Supabase Vault. `integrations` stores `access_token_ref`, never a token |
| Structured audit of plan changes | `plan_mutations`, written on every mutation (hard rule 10), read by `repositories/decisions.ts` |

## Still outstanding before launch

These need a decision or a signature, not code:

1. **Legal review** of every document here.
2. **Signed DPAs** with each sub-processor, and confirmation each offers UK/EU-appropriate
   transfer terms.
3. **Hosting region — half done.** Supabase is in the **UK** (confirmed). Vercel is not set up
   yet; when it is, it must run in London. `vercel.json` already pins `lhr1`, because Vercel's
   default function region is Washington DC and the account-erasure route would otherwise process
   personal data in the US. Verify it on the first deployment and record it in
   `sub-processors.md`. §7 is explicit that migrating later is painful.
4. **Controller identity** — registered company name, address, ICO registration.
5. **Provider-specific terms.** Strava's are flagged as pending review in the roadmap's
   out-of-scope list; no provider connection should ship before its terms are cleared.

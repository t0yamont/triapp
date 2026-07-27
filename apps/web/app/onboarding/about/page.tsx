'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { checkAgeEligibility, grantConsent, MIN_AGE_YEARS, type AgeRejection } from '@ironflow/core/consent';
import { Button, Card, Field, Input, Select } from '@ironflow/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { NotConnectedBanner } from '../../../components/NotConnectedBanner';
import { useSkipOnboardingIfPlanned } from '../../../lib/post-auth';
import { supabaseConfigured, useSupabase } from '../../../lib/supabase';

// Consent is versioned policy, not a form field (02-ARCHITECTURE.md §7) — the version, the 16+
// gate and the row shape all come from `@ironflow/core/consent` so that bumping the policy
// re-prompts everyone instead of quietly applying to new sign-ups only.
const AGE_MESSAGE: Record<AgeRejection, string> = {
  malformed_date: "That date doesn't look right.",
  not_yet_born: "That date is in the future.",
  under_minimum_age: `You must be ${MIN_AGE_YEARS} or over to use TriFlow.`,
};

const schema = z.object({
  displayName: z.string().min(1, 'Required'),
  dateOfBirth: z
    .string()
    .min(1, 'Required')
    // A hard stop, not a warning: below 16 consent has to come from a parent, and there is no
    // flow for that. Checked in calendar years so the day before a birthday is not rounded up.
    .superRefine((value, ctx) => {
      const check = checkAgeEligibility(value, new Date().toISOString());
      if (!check.eligible) ctx.addIssue({ code: z.ZodIssueCode.custom, message: AGE_MESSAGE[check.reason] });
    }),
  sex: z.enum(['male', 'female', 'prefer_not_to_say']),
  units: z.enum(['metric', 'imperial']),
  timezone: z.string().min(1, 'Required'),
  healthDataConsent: z.literal(true, { errorMap: () => ({ message: 'Required to proceed' }) }),
  medicalDisclaimer: z.literal(true, { errorMap: () => ({ message: 'Required to proceed' }) }),
});
type FormValues = z.infer<typeof schema>;

export default function AboutPage() {
  const supabase = useSupabase();
  const router = useRouter();
  // Every authenticated path lands here — including OAuth, whose redirect URL is fixed before
  // anyone has logged in, and bookmarks. An athlete who already has a plan is sent to the app
  // instead of being asked for their details again. See `lib/post-auth.ts`.
  const { checking } = useSkipOnboardingIfPlanned();
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { units: 'metric', timezone: 'Europe/London', sex: 'prefer_not_to_say' },
  });

  async function onSubmit(values: FormValues) {
    if (!supabase) return;
    setBusy(true);
    setServerError(null);
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setBusy(false);
      setServerError('Please sign in first.');
      return;
    }
    const now = new Date().toISOString();
    const { error } = await supabase.from('profiles').upsert({
      id: data.user.id,
      display_name: values.displayName,
      date_of_birth: values.dateOfBirth,
      sex: values.sex,
      units: values.units,
      timezone: values.timezone,
      ...grantConsent(now),
    });
    setBusy(false);
    if (error) {
      setServerError(error.message);
      return;
    }
    router.push('/onboarding/connect');
  }

  // Hold the form back for the one round trip it takes to find out. Rendering "About you" and
  // then redirecting looks identical to the bug this guard fixes.
  if (checking) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-16">
        <p className="text-body text-faint">Checking your account…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 px-6 py-16">
      <header className="flex flex-col gap-1">
        <span className="text-label uppercase tracking-widest text-faint">Step 3 of 8</span>
        <h1 className="text-h1 text-text">About you</h1>
      </header>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {!supabaseConfigured() && <NotConnectedBanner />}
          <Field label="Name" htmlFor="displayName" error={errors.displayName?.message}>
            <Input id="displayName" autoComplete="name" {...register('displayName')} />
          </Field>
          <Field
            label="Date of birth"
            htmlFor="dob"
            hint={`Used for age-based safety defaults. You must be ${MIN_AGE_YEARS} or over.`}
            error={errors.dateOfBirth?.message}
          >
            <Input id="dob" type="date" {...register('dateOfBirth')} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Sex" htmlFor="sex" error={errors.sex?.message}>
              <Select id="sex" {...register('sex')}>
                <option value="prefer_not_to_say">Prefer not to say</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </Select>
            </Field>
            <Field label="Units" htmlFor="units" error={errors.units?.message}>
              <Select id="units" {...register('units')}>
                <option value="metric">Metric</option>
                <option value="imperial">Imperial</option>
              </Select>
            </Field>
          </div>
          <Field label="Timezone (IANA)" htmlFor="tz" hint="Training days are computed in your local zone." error={errors.timezone?.message}>
            <Input id="tz" {...register('timezone')} />
          </Field>

          <div className="flex flex-col gap-3 rounded-control border border-white/10 bg-bg p-4">
            <label className="flex items-start gap-3 text-label text-muted">
              <input type="checkbox" className="mt-0.5" {...register('healthDataConsent')} />
              <span>
                I consent to TriFlow processing my health and fitness data (special-category data) to
                build my physiological model and training plan.
              </span>
            </label>
            {errors.healthDataConsent && <p className="text-label text-risk">{errors.healthDataConsent.message}</p>}
            <label className="flex items-start gap-3 text-label text-muted">
              <input type="checkbox" className="mt-0.5" {...register('medicalDisclaimer')} />
              <span>
                I understand TriFlow provides training guidance, not medical advice, and that I should
                seek medical clearance before beginning a training programme.
              </span>
            </label>
            {errors.medicalDisclaimer && <p className="text-label text-risk">{errors.medicalDisclaimer.message}</p>}
          </div>

          {serverError && <p className="text-label text-risk">{serverError}</p>}
          <Button type="submit" disabled={busy || !supabase}>
            Continue
          </Button>
        </form>
      </Card>
    </main>
  );
}

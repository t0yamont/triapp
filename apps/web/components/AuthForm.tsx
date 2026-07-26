'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Field, Input } from '@ironflow/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ONBOARDING_START, postAuthDestination } from '../lib/post-auth';
import { supabaseConfigured, useSupabase } from '../lib/supabase';
import { NotConnectedBanner } from './NotConnectedBanner';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'At least 8 characters'),
});
type FormValues = z.infer<typeof schema>;

export function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const supabase = useSupabase();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    if (!supabase) return;
    setBusy(true);
    setServerError(null);
    const { error } =
      mode === 'signup'
        ? await supabase.auth.signUp({ email: values.email, password: values.password })
        : await supabase.auth.signInWithPassword({ email: values.email, password: values.password });
    if (error) {
      setBusy(false);
      setServerError(error.message);
      return;
    }
    // An athlete who already has a plan goes straight to the app. Deciding here (rather than
    // only in the onboarding guard) means no flash of the "about you" form on the way through.
    router.push(await postAuthDestination(supabase));
    setBusy(false);
  }

  async function oauth(provider: 'google' | 'apple') {
    if (!supabase) return;
    // The provider needs this URL before anyone has logged in, so the decision can't happen
    // here — `/onboarding/about` bounces to the app itself when a plan already exists.
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}${ONBOARDING_START}` },
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      {!supabaseConfigured() && <NotConnectedBanner />}
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message}>
        <Input
          id="password"
          type="password"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          {...register('password')}
        />
      </Field>
      {serverError && <p className="text-label text-risk">{serverError}</p>}
      <Button type="submit" disabled={busy || !supabase}>
        {mode === 'signup' ? 'Create account' : 'Log in'}
      </Button>
      <div className="flex items-center gap-3 text-label text-faint">
        <span className="h-px flex-1 bg-white/10" /> or <span className="h-px flex-1 bg-white/10" />
      </div>
      <div className="flex gap-3">
        <Button type="button" variant="secondary" className="flex-1" disabled={!supabase} onClick={() => oauth('google')}>
          Google
        </Button>
        <Button type="button" variant="secondary" className="flex-1" disabled={!supabase} onClick={() => oauth('apple')}>
          Apple
        </Button>
      </div>
    </form>
  );
}

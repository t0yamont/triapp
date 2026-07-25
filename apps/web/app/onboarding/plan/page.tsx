'use client';

import { useState } from 'react';
import { PlanGeneration } from '../../../components/onboarding/PlanGeneration';
import { RaceAndAbilityForm, type RaceAndAbilityResult } from '../../../components/onboarding/RaceAndAbilityForm';

export default function OnboardingPlanPage() {
  const [result, setResult] = useState<RaceAndAbilityResult | null>(null);

  if (!result) {
    return <RaceAndAbilityForm onReady={setResult} />;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-5 py-12">
      <PlanGeneration input={result.input} baseline={result.baseline} />
    </main>
  );
}

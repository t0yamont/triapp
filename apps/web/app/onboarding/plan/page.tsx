import type { GeneratePlanInput } from '@ironflow/core/physio';
import { PlanGeneration } from '../../../components/onboarding/PlanGeneration';

// Representative athlete inputs. In the live flow these come from the athlete model (anchors,
// confidence) and the availability captured in onboarding; the plan itself is built by the
// pure engine (generatePlan) and, when signed in, persisted via @ironflow/api-client.
const INPUT: GeneratePlanInput = {
  totalWeeks: 18,
  eventType: 'ironman',
  course: 'long',
  availability: {
    dayMinutes: { 0: 240, 1: 60, 2: 90, 3: 60, 4: 75, 5: 45, 6: 240 },
    weeklyHoursMax: 12,
    longRideDay: 6,
    longRunDay: 0,
    swimDays: [2],
  },
  startingLoad: 420,
  confidence: 0.72,
  trainingAgeYears: 4,
  startDate: '2026-07-27',
};

export default function OnboardingPlanPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-5 py-12">
      <PlanGeneration input={INPUT} />
    </main>
  );
}

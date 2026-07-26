import { beforeEach, describe, expect, it, vi } from 'vitest';

const getActivePlan = vi.fn();
vi.mock('@ironflow/api-client', () => ({ getActivePlan: (...a: unknown[]) => getActivePlan(...a) }));

const { APP_HOME, ONBOARDING_START, postAuthDestination } = await import('./post-auth');

/** Only the two things `postAuthDestination` touches. */
const client = (user: { id: string } | null) =>
  ({ auth: { getUser: async () => ({ data: { user } }) } }) as never;

describe('postAuthDestination', () => {
  beforeEach(() => {
    getActivePlan.mockClear();
  });

  it('sends an athlete who already has a plan straight to the app', async () => {
    getActivePlan.mockResolvedValue({ id: 'plan-1' });
    expect(await postAuthDestination(client({ id: 'ath-1' }))).toBe(APP_HOME);
  });

  it('sends a genuinely new athlete to onboarding', async () => {
    getActivePlan.mockResolvedValue(null);
    expect(await postAuthDestination(client({ id: 'ath-1' }))).toBe(ONBOARDING_START);
  });

  it('sends a signed-out visitor to onboarding without looking up a plan', async () => {
    expect(await postAuthDestination(client(null))).toBe(ONBOARDING_START);
    expect(getActivePlan).not.toHaveBeenCalled();
  });

  // The deliberate failure direction: being asked for details twice is annoying, but stranding a
  // new athlete on a dashboard with no plan and no route into onboarding is unrecoverable. The
  // duplicate-plan consequence is blocked at the write in `PlanGeneration`, not here.
  it('falls back to onboarding when the lookup fails', async () => {
    // Thrown synchronously on purpose: a mock returning a rejected promise gets recorded in
    // `mock.results` without a handler, which vitest reports as an unhandled rejection. The
    // `catch` under test treats both identically.
    getActivePlan.mockImplementation(() => {
      throw new Error('network');
    });
    expect(await postAuthDestination(client({ id: 'ath-1' }))).toBe(ONBOARDING_START);
  });

  it('falls back to onboarding when the session lookup throws', async () => {
    const broken = { auth: { getUser: async () => { throw new Error('no session'); } } } as never;
    expect(await postAuthDestination(broken)).toBe(ONBOARDING_START);
  });
});

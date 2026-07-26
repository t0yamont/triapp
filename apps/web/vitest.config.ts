import { defineConfig } from 'vitest/config';

/**
 * Tests for `lib/*` only — the pure row→view mappers behind the live hooks.
 *
 * There is no component/DOM testing here on purpose: components are presentation glue
 * (CLAUDE.md §Architecture), while a mapper deciding "which local day is this session on" or
 * "is this load figure absent or zero" is exactly the kind of logic that is wrong silently.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});

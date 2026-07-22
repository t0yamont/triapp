import { defineConfig } from 'vitest/config';

// The physio engine is pure (03-ALGORITHM.md §1). Node environment, no DOM,
// deterministic. Coverage target for physio/ is 100% branch (CLAUDE.md §Testing).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['physio/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['physio/**/*.ts'],
      // types.ts is pure type declarations (no runtime statements); index.ts is a barrel.
      exclude: ['physio/**/*.test.ts', 'physio/index.ts', 'physio/**/index.ts', 'physio/types.ts'],
      thresholds: { branches: 100, functions: 100, lines: 100, statements: 100 },
      reporter: ['text', 'html'],
    },
  },
});

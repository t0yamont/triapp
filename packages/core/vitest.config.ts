import { defineConfig } from 'vitest/config';

// The physio engine is pure (03-ALGORITHM.md §1). Node environment, no DOM,
// deterministic. Coverage target for physio/ is 100% branch (CLAUDE.md §Testing).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['physio/**/*.test.ts', 'ingest/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['physio/**/*.ts', 'ingest/**/*.ts'],
      // types.ts files are pure type declarations (no runtime); index.ts files are barrels.
      exclude: ['**/*.test.ts', '**/index.ts', 'physio/types.ts', 'ingest/types.ts'],
      // physio is the spec-mandated 100%-branch engine; ingest is reported but not gated here.
      thresholds: {
        'physio/**/*.ts': { branches: 100, functions: 100, lines: 100, statements: 100 },
      },
      reporter: ['text', 'html'],
    },
  },
});

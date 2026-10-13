import { defineConfig } from 'vitest/config';

// The test files share one local D1 (.wrangler/test-state), so they run one after another.
export default defineConfig({ test: { fileParallelism: false } });

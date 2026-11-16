import { defineConfig } from 'vitest/config';
// --expose-gc lets the loop soak test (tests/loop.test.ts) take honest heap readings.
export default defineConfig({ test: { include: ['tests/**/*.test.ts'], testTimeout: 120000, execArgv: ['--expose-gc'] } });

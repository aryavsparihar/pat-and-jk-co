import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  resolve: {
    // `import 'server-only'` throws outside a React Server build; the tests are server code
    alias: { 'server-only': fileURLToPath(new URL('./tests/helpers/server-only.ts', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    // The files share one database; in parallel they race to sync its schema and to clean up
    fileParallelism: false,
    // These tests talk to a real database, which on a cold CI runner is slower than on a laptop
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
})

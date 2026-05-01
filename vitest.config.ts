import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: ['**/e2e_p2p.test.mjs'],
    environment: 'node',
    include: ['tests/**/*.test.{js,ts,mjs}']
  }
})
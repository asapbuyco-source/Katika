import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    exclude: [
      '**/e2e_p2p.test.mjs',
      '**/bot_strength.test.mjs',
      '**/checkers_bot.test.mjs'
    ],
    environment: 'node',
    include: ['tests/**/*.test.{js,ts,mjs}']
  }
})

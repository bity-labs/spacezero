import animate from 'tailwindcss-animate'
import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class'],
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {}
  },
  plugins: [animate]
} satisfies Config

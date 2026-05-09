/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './index.html',
    './index.tsx',
    './components/**/*.{tsx,ts}',
    './services/**/*.{tsx,ts}',
    './hooks/**/*.{tsx,ts}',
    './types/**/*.ts',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Comfortaa', 'sans-serif'],
        display: ['Comfortaa', 'sans-serif'],
      },
      colors: {
        royal: {
          900: 'rgb(var(--c-royal-900) / <alpha-value>)',
          800: 'rgb(var(--c-royal-800) / <alpha-value>)',
          700: '#432c9a',
          950: 'rgb(var(--c-royal-950) / <alpha-value>)',
        },
        gold: {
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        cam: {
          green: '#007a5e',
          red: '#ce1126',
          yellow: '#fcd116',
        },
        white: 'rgb(var(--c-text-white) / <alpha-value>)',
        'slate-200': 'rgb(var(--c-text-base) / <alpha-value>)',
      },
      gridTemplateColumns: {
        '15': 'repeat(15, minmax(0, 1fr))',
      },
      gridTemplateRows: {
        '15': 'repeat(15, minmax(0, 1fr))',
      },
    },
  },
  plugins: [],
};

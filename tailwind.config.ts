import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0f0f10',
        surface: '#17171a',
        surfaceAlt: '#1d1d21',
        border: '#2a2a2f',
        borderSub: '#232327',
        text: '#f2f2f3',
        textSub: '#c8c8cc',
        textMuted: '#8b8b93',
        textDim: '#5f5f68',
        taken: '#e05252',
        blocked: '#4d8fe0',
        accent: '#e0b152',
        // The other two medals the players list hands out. Gold is `accent`
        // (#e0b152) — the colour the app already uses for a "best" — so only
        // silver and bronze need tokens of their own: bright enough to read as
        // metal on the dark surface, dim enough not to outshine the gold.
        silver: '#aeb4c0',
        bronze: '#c07a4e',
      },
    },
  },
  plugins: [],
};

export default config;

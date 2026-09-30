import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0f0f10',
        surface: '#17171a',
        surfaceAlt: '#1d1d21',
        // Borders are split by job, not by shade. `border` is anything you
        // have to be able to *identify* — card and table outlines, the header
        // rule, chip and button outlines, the fixed jump rail and "back to
        // top" panels — so it clears 3:1 (WCAG 1.4.11) against all three
        // surfaces (3.6:1 on bg, 3.3:1 on surface, 3.1:1 on surfaceAlt).
        // `borderSub` is the quieter rule that separates rows *inside* a table
        // or a modal list, where the row's own contents already identify it, so
        // it sits a clear step below `border` (~2.0:1 on surface) instead of
        // turning every table into a grid.
        border: '#6a6a74',
        borderSub: '#4a4a52',
        text: '#f2f2f3',
        textSub: '#c8c8cc',
        // The muted end of the text ramp still has to be *readable*, not just
        // visibly secondary: every step clears WCAG AA 4.5:1 against the darkest
        // surface it can land on, because all of them carry real content — the
        // date line, the "(N)" roster ranks, the "absent:" list, the sort
        // arrows, and every numeric cell in the two stats tables. `textDim` is
        // the floor at 4.9:1 on `surfaceAlt`; `textMuted` keeps a wider gap
        // above it so the two never read as the same weight.
        textMuted: '#a0a0aa',
        textDim: '#8a8a95',
        taken: '#e35a5a',
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

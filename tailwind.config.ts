import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  // Class-driven themes: every color below resolves to a CSS variable whose
  // value flips with the `dark` class on <html> (see globals.css — light
  // values on `:root`, dark values under `.dark`). Dark is the default: the
  // class ships on <html> in the root layout. `rgb(var(--x) / <alpha-value>)`
  // keeps Tailwind's opacity modifiers (bg-accent/15, border-accent/40, …)
  // working in both themes.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        surfaceAlt: 'rgb(var(--surface-alt) / <alpha-value>)',
        // Borders are split by job, not by shade. `border` is anything you
        // have to be able to *identify* — card and table outlines, the header
        // rule, chip and button outlines, the fixed jump rail and "back to
        // top" panels — so it clears 3:1 (WCAG 1.4.11) against all three
        // surfaces in *both* themes (dark values hold 3.1–3.6:1 on the dark
        // surfaces; light values hold 3.3:1 on white).
        // `borderSub` is the quieter rule that separates rows *inside* a table
        // or a modal list, where the row's own contents already identify it, so
        // it sits a clear step below `border` instead of turning every table
        // into a grid.
        border: 'rgb(var(--border) / <alpha-value>)',
        borderSub: 'rgb(var(--border-sub) / <alpha-value>)',
        text: 'rgb(var(--text) / <alpha-value>)',
        textSub: 'rgb(var(--text-sub) / <alpha-value>)',
        // The muted end of the text ramp still has to be *readable*, not just
        // visibly secondary: every step clears WCAG AA 4.5:1 against the
        // surface it can land on in both themes, because all of them carry
        // real content — the date line, the "(N)" roster ranks, the "absent:"
        // list, the sort arrows, and every numeric cell in the two stats
        // tables. `textDim` is the floor in each theme; `textMuted` keeps a
        // wider gap above it so the two never read as the same weight.
        textMuted: 'rgb(var(--text-muted) / <alpha-value>)',
        textDim: 'rgb(var(--text-dim) / <alpha-value>)',
        taken: 'rgb(var(--taken) / <alpha-value>)',
        blocked: 'rgb(var(--blocked) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        // Positive-difference green (the MVP "played above rank" figures). The
        // mid-tone dark value reads on dark surfaces but would wash out on
        // white, so light gets its own darker step — same hue family, per-theme
        // value like everything else here.
        promote: 'rgb(var(--promote) / <alpha-value>)',
        // The other two medals the players list hands out. Gold is `accent`
        // (#e0b152 in dark — the colour the app already uses for a "best") —
        // so only silver and bronze need tokens of their own: bright enough to
        // read as metal on the dark surfaces, dim enough not to outshine the
        // gold, and darkened one step for light so they still read on white.
        silver: 'rgb(var(--silver) / <alpha-value>)',
        bronze: 'rgb(var(--bronze) / <alpha-value>)',
      },
    },
  },
  plugins: [],
};

export default config;

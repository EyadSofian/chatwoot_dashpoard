import type { Config } from "tailwindcss";

/**
 * Engosoft Analytics — light theme.
 * Brand: vivid azure (#0B6BF0) + deep navy (#0B2545), taken from the logo.
 * Colors resolve through CSS variables (globals.css) so they stay swappable.
 */
const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          400: "rgb(var(--brand-400) / <alpha-value>)",
          500: "rgb(var(--brand-500) / <alpha-value>)",
          600: "rgb(var(--brand-600) / <alpha-value>)",
          700: "rgb(var(--brand-700) / <alpha-value>)",
        },
        navy: "rgb(var(--navy) / <alpha-value>)",

        primary: "rgb(var(--color-primary) / <alpha-value>)",
        "primary-hover": "rgb(var(--color-primary-hover) / <alpha-value>)",
        "on-primary": "rgb(var(--color-on-primary) / <alpha-value>)",
        secondary: "rgb(var(--color-secondary) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",

        background: "rgb(var(--color-background) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--color-surface-2) / <alpha-value>)",
        foreground: "rgb(var(--color-foreground) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        "muted-foreground": "rgb(var(--color-muted-foreground) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",

        success: "rgb(var(--color-success) / <alpha-value>)",
        "success-fg": "rgb(var(--color-success-fg) / <alpha-value>)",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
        "warning-fg": "rgb(var(--color-warning-fg) / <alpha-value>)",
        destructive: "rgb(var(--color-destructive) / <alpha-value>)",
        "destructive-fg": "rgb(var(--color-destructive-fg) / <alpha-value>)",

        ring: "rgb(var(--color-ring) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-cairo)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        card: "1rem", // 16px — the soft bento radius
        xl: "0.875rem",
      },
      boxShadow: {
        // Soft, navy-tinted elevation — never a flat black shadow.
        card: "0 1px 2px 0 rgb(11 37 69 / 0.04), 0 6px 20px -12px rgb(11 37 69 / 0.14)",
        "card-hover": "0 2px 4px 0 rgb(11 37 69 / 0.05), 0 16px 32px -16px rgb(11 37 69 / 0.22)",
        pop: "0 24px 48px -20px rgb(11 37 69 / 0.28)",
        brand: "0 6px 16px -6px rgb(11 107 240 / 0.45)",
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.25s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

/* Tema mapeado 1:1 a los design tokens de marca (src/styles/tokens.css).
   Ningún color se define aquí en hex: todo referencia variables --cci-*. */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cci: {
          orange: {
            DEFAULT: "var(--cci-orange)",
            600: "var(--cci-orange-600)",
          },
          amber: "var(--cci-amber)",
          slate: {
            DEFAULT: "var(--cci-slate)",
            600: "var(--cci-slate-600)",
          },
          ink: "var(--cci-ink)",
          surface: {
            DEFAULT: "var(--cci-surface)",
            2: "var(--cci-surface-2)",
          },
          line: "var(--cci-line)",
          text: "var(--cci-text)",
          muted: "var(--cci-muted)",
          success: "var(--cci-success)",
          warn: "var(--cci-warn)",
          danger: "var(--cci-danger)",
        },
      },
      fontFamily: {
        sans: "var(--cci-font-sans)",
        display: "var(--cci-font-display)",
        mono: "var(--cci-font-mono)",
      },
      borderRadius: {
        cci: "var(--cci-radius)",
      },
      boxShadow: {
        cci: "var(--cci-shadow)",
      },
    },
  },
  plugins: [],
};

export default config;

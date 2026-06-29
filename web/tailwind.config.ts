import type { Config } from "tailwindcss";

// Design tokens mirror docs/design_v2/README.md (the final handoff).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0d0a06",
        ink: "#f7efe2",
        muted: "#a89a82",
        faint: "#7f7259",
        ember: "#e8552d",
        orange: "#fb7a3c",
        gold: "#f6c64a",
        amber: "#d99a4a",
      },
      fontFamily: {
        serif: ["var(--font-newsreader)", "Georgia", "serif"],
        sans: ["var(--font-hanken)", "system-ui", "sans-serif"],
        mono: ["var(--font-space-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

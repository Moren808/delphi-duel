import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  // Class-based dark mode: toggled by adding `dark` to <html>.
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Cream page background matching Delphi's site (warm off-white).
        cream: "#f5f1e8",
        // Single ink color so we can switch to white in dark without renaming.
        ink: {
          DEFAULT: "#0a0a0a",
          muted: "#525252",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Helvetica", "Arial", "sans-serif"],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Cascadia Code",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      keyframes: {
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(0, 0, 0, 0.55)" },
          "100%": { boxShadow: "0 0 0 12px rgba(0, 0, 0, 0)" },
        },
      },
      animation: {
        "pulse-ring": "pulse-ring 1.5s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Trading-terminal palette: slate background, role-coded accents.
        // Bull = green-500, Bear = red-500 (per spec).
        bull: {
          DEFAULT: "#22c55e",
          fg: "#22c55e",
          bg: "#052e16",
          border: "#166534",
        },
        bear: {
          DEFAULT: "#ef4444",
          fg: "#ef4444",
          bg: "#3b0a0a",
          border: "#991b1b",
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
          "0%": { boxShadow: "0 0 0 0 rgba(34, 197, 94, 0.55)" },
          "100%": { boxShadow: "0 0 0 12px rgba(34, 197, 94, 0)" },
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

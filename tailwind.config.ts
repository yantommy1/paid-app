import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paid: {
          ink: "#FFFFFF",
          mist: "#0D0D0D",
          accent: "#1B4332",
          secondary: "#6B6B6B",
          border: "#E5E5E5",
          surface: "#F7F7F5",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-playfair)", "Georgia", "serif"],
        mono: ["var(--font-dm-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

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
          brand: "#0f766e",
          accent: "#14b8a6",
        },
      },
    },
  },
  plugins: [],
};

export default config;

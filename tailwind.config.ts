import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        brand: {
          primary: "var(--brand-primary)",
          secondary: "var(--brand-secondary)",
          accent: "var(--brand-accent)",
          text: "var(--brand-text)",
        },
        slate: {
          300: "#64748b", // Mapped to slate-500
          400: "#475569", // Mapped to slate-600
          500: "#334155", // Mapped to slate-700
        },
        gray: {
          300: "#6b7280", // Mapped to gray-500
          400: "#4b5563", // Mapped to gray-600
          500: "#374151", // Mapped to gray-700
        },
      },
    },
  },
  plugins: [],
};
export default config;

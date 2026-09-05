/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}"],
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f4f3ff",
          100: "#ebe8ff",
          200: "#d5cfff",
          300: "#b3a7ff",
          400: "#8b74ff",
          500: "#6c47f2",
          600: "#5730d6",
          700: "#4523ad",
          800: "#391f89",
          900: "#241457",
          950: "#150c33"
        },
        flame: {
          50: "#fff8ec",
          100: "#ffedc9",
          200: "#ffd98c",
          300: "#ffbd4f",
          400: "#ffa01f",
          500: "#f98307",
          600: "#dd6203",
          700: "#b74606",
          800: "#94370c",
          900: "#7a2f0d"
        },
        surface: {
          light: "#fbfaff",
          panel: "#ffffff",
          dark: "#0f0b1e",
          panelDark: "#191430"
        }
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"]
      },
      borderRadius: {
        xl2: "1.25rem"
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(108,71,242,0.12), 0 8px 24px -8px rgba(108,71,242,0.35)"
      }
    }
  },
  plugins: []
};

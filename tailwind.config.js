/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./app-sections/**/*.{js,jsx,ts,tsx}",
    "./design-system/**/*.{js,jsx,ts,tsx}",
    "./features/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-raised": "var(--bg-raised)",
        card: "var(--card)",
        "card-subtle": "var(--card-subtle)",
        overlay: "var(--overlay)",

        ink: "var(--ink)",
        "ink-secondary": "var(--ink-secondary)",
        "ink-tertiary": "var(--ink-tertiary)",
        "on-mint": "var(--on-mint)",
        "on-orange": "var(--on-orange)",

        primary: "var(--primary)",
        "primary-soft": "var(--primary-soft)",
        "primary-strong": "var(--primary-strong)",
        accent: "var(--accent)",
        "accent-soft": "var(--accent-soft)",
        "accent-strong": "var(--accent-strong)",

        success: "var(--success)",
        "success-soft": "var(--success-soft)",
        warning: "var(--warning)",
        "warning-soft": "var(--warning-soft)",
        danger: "var(--danger)",
        "danger-soft": "var(--danger-soft)",

        line: "var(--line)",
        "line-strong": "var(--line-strong)",
      },
      borderRadius: {
        sm: "8px",
        md: "10px",
        lg: "12px",
        xl: "14px",
        "2xl": "18px",
        "3xl": "22px",
        "4xl": "26px",
        pill: "9999px",
      },
      fontFamily: {
        sans: ["Inter", "System"],
      },
      spacing: {
        // 4-pt grid extras that aren't in Tailwind defaults
        4.5: "18px",
      },
    },
  },
  plugins: [],
};

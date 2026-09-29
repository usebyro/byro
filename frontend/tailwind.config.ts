import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: ['class'], 
  safelist: ['dark'], 
  theme: {
    extend: {
      screens: {
        'xs': '320px',
        'sm': '375px',
        'md': '768px',
        'lg': '1024px',
        'xl': '1280px',
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        ink: "#14161C",
        brand: { DEFAULT: "#3669F6", dark: "#2451D6" },
        paper: "#F7F9FC",
        marigold: "#FFC93C",
        muted: "#5B6272",
        faint: "#8A91A0",
        line: "#E3E8F0",
        hairline: "#EDF0F5",
        mist: "#F3F6FB",
        sky: "#E6F2FC",
        blush: "#FCECEE",
        butter: "#FFFDE9",
        mint: "#E9F7EF",
        "stamp-pink": "#D0668E",
        "stamp-gold": "#C9971C",
        "stamp-green": "#2F9E6E",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        'main-section': "url('/assets/mainsection.png')",
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        bounce: {
          '0%, 100%': {
            transform: 'translateY(-25%)',
            animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)',
          },
          '50%': {
            transform: 'none',
            animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)',
          },
        },
      },
      animation: {
        float: 'float 3s ease-in-out infinite',
        bounce: 'bounce 1s infinite',
      },
    },
  },
  plugins: [typography],
} satisfies Config;

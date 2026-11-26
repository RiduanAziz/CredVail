import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        brand: {
          blue: "#2572f4",
          violet: "#8352e9",
          indigo: "#5a5cf2",
          navy: "#0f1d38",
          wordmark: "#111f42",
          surface: "#152445",
          50: "#f0f4ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#5a5cf2",
          600: "#2572f4",
          700: "#8352e9",
          800: "#4338ca",
          900: "#1e1b4b",
          950: "#0f1d38",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          50: "#f4f6ff",
          100: "#e8edff",
          200: "#d4dcff",
          300: "#b3c1fe",
          400: "#859bfb",
          500: "#5a5cf2",
          600: "#2572f4",
          700: "#8352e9",
          800: "#3730a3",
          900: "#111f42",
          950: "#0f1d38",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        verified: {
          DEFAULT: "#10b981",
          foreground: "#ffffff",
        },
        revoked: {
          DEFAULT: "#ef4444",
          foreground: "#ffffff",
        },
        warning: {
          DEFAULT: "#f59e0b",
          foreground: "#ffffff",
        },
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #2572f4 0%, #5a5cf2 50%, #8352e9 100%)",
        "brand-gradient-hover": "linear-gradient(135deg, #1d5ec9 0%, #484ae0 50%, #703ed4 100%)",
        "brand-gradient-subtle": "linear-gradient(135deg, rgba(37, 114, 244, 0.08) 0%, rgba(131, 82, 233, 0.08) 100%)",
        "brand-gradient-dark": "linear-gradient(135deg, #0f1d38 0%, #152445 50%, #1e1b4b 100%)",
      },
      boxShadow: {
        "brand-glow": "0 0 25px -5px rgba(90, 92, 242, 0.35)",
        "brand-glow-lg": "0 0 35px -5px rgba(131, 82, 233, 0.45)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
};

export default config;

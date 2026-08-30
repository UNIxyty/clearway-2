import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Console design system: Public Sans UI + IBM Plex Mono for data.
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // Platform tokens — THE shared source (shared/design-tokens.json).
        cw: {
          page: "#fbfbfc",
          card: "#ffffff",
          sidebar: "#f5f6f7",
          border: "#e6e7ea",
          borderInner: "#eef0f2",
          ink: "#17181c",
          body: "#3a3d44",
          muted: "#6c7079",
          faint: "#9aa0a8",
          primary: "#2563eb",
          primaryDeep: "#1d4ed8",
          primaryTint: "#eef4ff",
          green: "#16a34a",
          amber: "#f59e0b",
          red: "#e5484d",
          hover: "#eceef0",
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        // Bracket / playoff design tokens
        page:     '#f5f5f5',
        navy:     { DEFAULT: '#0f1e3c', light: '#1a2e54' },
        'bk-blue':   { DEFAULT: '#1a56db', dark: '#1647b8' },
        'bk-amber':  { DEFAULT: '#f59e0b', dark: '#d97706' },
        'bk-accent': { DEFAULT: '#f97316', dark: '#ea580c' },
        pickfill: '#EBF3FF',
      },
    },
  },
  plugins: [],
} satisfies Config;

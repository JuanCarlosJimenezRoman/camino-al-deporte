/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Inter',
          'Roboto',
          'sans-serif',
        ],
      },
      colors: {
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgb(var(--popover) / <alpha-value>)',
          foreground: 'rgb(var(--popover-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--success) / <alpha-value>)',
          foreground: 'rgb(var(--success-foreground) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--warning) / <alpha-value>)',
          foreground: 'rgb(var(--warning-foreground) / <alpha-value>)',
        },
        border: 'rgb(var(--border) / <alpha-value>)',
        input: 'rgb(var(--input-background) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
        sidebar: {
          DEFAULT: 'rgb(var(--sidebar) / <alpha-value>)',
          foreground: 'rgb(var(--sidebar-foreground) / <alpha-value>)',
          primary: 'rgb(var(--sidebar-primary) / <alpha-value>)',
          'primary-foreground': 'rgb(var(--sidebar-primary-foreground) / <alpha-value>)',
          accent: 'rgb(var(--sidebar-accent) / <alpha-value>)',
          'accent-foreground': 'rgb(var(--sidebar-accent-foreground) / <alpha-value>)',
          border: 'rgb(var(--sidebar-border) / <alpha-value>)',
        },
        chart: {
          1: 'rgb(var(--chart-1) / <alpha-value>)',
          2: 'rgb(var(--chart-2) / <alpha-value>)',
          3: 'rgb(var(--chart-3) / <alpha-value>)',
          4: 'rgb(var(--chart-4) / <alpha-value>)',
          5: 'rgb(var(--chart-5) / <alpha-value>)',
        },
      },
      borderRadius: {
        sm: 'calc(var(--radius) - 4px)',
        md: 'calc(var(--radius) - 2px)',
        lg: 'var(--radius)',
        xl: 'calc(var(--radius) + 4px)',
        card: 'var(--radius-card)',
      },
      boxShadow: {
        /* Sombras muy ligeras a propósito — la jerarquía viene de fondo y
           borde, no de sombra pesada (regla: "la interfaz debe sentirse
           ligera"). */
        soft: '0 1px 2px 0 rgb(0 0 0 / 0.03), 0 1px 2px 0 rgb(0 0 0 / 0.04)',
        card: '0 1px 2px 0 rgb(0 0 0 / 0.02), 0 3px 10px -2px rgb(0 0 0 / 0.05)',
        /* Para elementos flotantes por encima del contenido: dropdowns,
           popovers, dialogs, drawers. */
        elevated: '0 4px 6px -2px rgb(0 0 0 / 0.04), 0 12px 24px -4px rgb(0 0 0 / 0.10)',
      },
    },
  },
  plugins: [],
};

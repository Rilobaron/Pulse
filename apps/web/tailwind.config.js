/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0b',
        card: '#131316',
        'card-hover': '#1a1a1f',
        border: '#27272a',
        'border-subtle': '#1f1f23',
        foreground: '#fafafa',
        muted: '#a1a1aa',
        'muted-dark': '#71717a',
        primary: {
          DEFAULT: '#10b981',
          hover: '#059669',
          muted: 'rgba(16, 185, 129, 0.12)',
        },
        success: '#10b981',
        danger: '#ef4444',
        'danger-muted': 'rgba(239, 68, 68, 0.12)',
        warning: '#f59e0b',
        'warning-muted': 'rgba(245, 158, 11, 0.12)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(0, 0, 0, 0.3)',
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      colors: {
        ink: {
          50:  '#f5f3ef',
          100: '#e8e3d8',
          200: '#cec5b0',
          300: '#b0a389',
          400: '#948468',
          500: '#7d6d54',
          600: '#665847',
          700: '#50443a',
          800: '#3a312d',
          900: '#252020',
          950: '#141010',
        },
        amber: {
          50:  '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        paper: '#faf8f3',
        parchment: '#f0ebe0',
      },
      boxShadow: {
        card: '0 1px 3px rgba(37,32,32,0.06), 0 4px 16px rgba(37,32,32,0.04)',
        'card-hover': '0 2px 8px rgba(37,32,32,0.10), 0 8px 32px rgba(37,32,32,0.08)',
        'inset-sm': 'inset 0 1px 3px rgba(37,32,32,0.08)',
      },
    },
  },
  plugins: [],
}

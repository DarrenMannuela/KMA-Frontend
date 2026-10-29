/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      screens: {
        // The permanent-sidebar-vs-mobile-drawer split used to be plain
        // `md:` (768px width only) — but plenty of phones exceed 768px of
        // CSS width in landscape (commonly ~740-930px) while still only
        // having ~400px of height, so they got the "desktop" chrome: a
        // permanent 240px sidebar with no hamburger, squeezed into a short
        // screen. `dock` requires real height too, so only a genuine
        // tablet/laptop gets the docked sidebar; a landscape phone still
        // gets the mobile drawer. Used wherever the sidebar's docked state
        // is decided — keep every one of those spots on `dock:`, not `md:`.
        dock: { raw: '(min-width: 768px) and (min-height: 500px)' },
      },
      fontFamily: {
        display: ['"Sora"', 'sans-serif'],
        body:    ['"Sora"', 'sans-serif'],
        mono:    ['"DM Mono"', 'monospace'],
      },
      colors: {
        navy: {
          50:  '#f0f2f8',
          100: '#dde2f0',
          200: '#bcc7e3',
          300: '#92a3d0',
          400: '#6b80bc',
          500: '#4f65ab',
          600: '#3e4f8f',
          700: '#2d3a6b' ,
          800: '#1e2748',
          900: '#131a32',
          950: '#0a0f1e',
        },
        gold: {
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        slate: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
      },
      boxShadow: {
        card:       '0 1px 3px rgba(10,15,30,0.08), 0 4px 16px rgba(10,15,30,0.04)',
        'card-hover': '0 2px 8px rgba(10,15,30,0.12), 0 8px 32px rgba(10,15,30,0.08)',
        sidebar:    '4px 0 24px rgba(10,15,30,0.15)',
      },
    },
  },
  plugins: [],
}

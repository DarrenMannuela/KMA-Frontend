import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'kma-theme'

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null)

// The <html> element already has (or doesn't have) the `dark` class by the
// time this runs — index.html's inline script sets it pre-paint to avoid a
// flash of the wrong theme. Reading it back here keeps this state in sync
// with that decision instead of re-deriving it (and possibly disagreeing).
function initialTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0a0f1e' : '#ffffff')
    try { localStorage.setItem(STORAGE_KEY, theme) } catch { /* private browsing, etc. */ }
  }, [theme])

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}

import { useEffect } from 'react'
import { ThemeProvider } from './lib/ui-core'
import { AppShell } from './components/layout'

function App() {
  // Theme persistence script equivalent to Next.js
  useEffect(() => {
    const stored = localStorage.getItem('ui-theme')
    if (stored) {
      document.documentElement.classList.remove('light', 'dark')
      document.documentElement.classList.add(stored)
    } else {
      const media = window.matchMedia('(prefers-color-scheme: dark)')
      document.documentElement.classList.remove('light', 'dark')
      document.documentElement.classList.add(media.matches ? 'dark' : 'light')
    }
  }, [])

  return (
    <ThemeProvider 
      defaultTheme="dark" 
      storageKey="ui-theme"
    >
      <AppShell />
    </ThemeProvider>
  )
}

export default App

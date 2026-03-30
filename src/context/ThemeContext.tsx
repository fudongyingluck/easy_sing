import React, { createContext, useContext, useEffect, useState } from 'react'
import { useColorScheme } from 'react-native'
import { loadUserSettings } from '../services/storage'

export interface ThemeColors {
  background: string
  surface: string
  border: string
  text: string
  textSecondary: string
  chartBackground: string
  chartGrid: string
  chartLine: string
  chartLabel: string
}

const light: ThemeColors = {
  background: '#ffffff',
  surface: '#f5f5f5',
  border: '#eeeeee',
  text: '#000000',
  textSecondary: '#666666',
  chartBackground: '#f5f5f5',
  chartGrid: '#e0e0e0',
  chartLine: '#4CAF50',
  chartLabel: '#666666',
}

const dark: ThemeColors = {
  background: '#121212',
  surface: '#1e1e1e',
  border: '#2c2c2c',
  text: '#ffffff',
  textSecondary: '#aaaaaa',
  chartBackground: '#1a1a1a',
  chartGrid: '#2c2c2c',
  chartLine: '#66BB6A',
  chartLabel: '#aaaaaa',
}

interface ThemeContextValue {
  colors: ThemeColors
  isDark: boolean
  themeMode: 'light' | 'dark' | 'system'
  setThemeMode: (mode: 'light' | 'dark' | 'system') => void
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: light,
  isDark: false,
  themeMode: 'system',
  setThemeMode: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme()
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('system')

  useEffect(() => {
    loadUserSettings().then(s => setThemeMode(s.themeMode ?? 'system'))
  }, [])

  const isDark =
    themeMode === 'dark' ||
    (themeMode === 'system' && systemScheme === 'dark')

  return (
    <ThemeContext.Provider value={{ colors: isDark ? dark : light, isDark, themeMode, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

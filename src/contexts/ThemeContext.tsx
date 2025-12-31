'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Theme = 'Dark' | 'Light' | 'Auto';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  effectiveTheme: 'dark' | 'light'; // The actual theme being applied (resolved from Auto)
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'muscadine-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'Auto';
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    const initialTheme = stored || 'Auto';
    console.log('[ThemeContext] Initial theme from localStorage:', initialTheme);
    return initialTheme;
  });

  const [effectiveTheme, setEffectiveTheme] = useState<'dark' | 'light'>(() => {
    if (typeof window === 'undefined') return 'dark';
    if (theme !== 'Auto') {
      return theme === 'Dark' ? 'dark' : 'light';
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Update effective theme when theme changes
  useEffect(() => {
    console.log('[ThemeContext] Theme changed to:', theme);
    if (theme === 'Auto') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const updateEffectiveTheme = () => {
        const newEffective = mediaQuery.matches ? 'dark' : 'light';
        console.log('[ThemeContext] Auto mode - effective theme:', newEffective);
        setEffectiveTheme(newEffective);
      };
      
      updateEffectiveTheme();
      mediaQuery.addEventListener('change', updateEffectiveTheme);
      
      return () => {
        mediaQuery.removeEventListener('change', updateEffectiveTheme);
      };
    } else {
      const newEffective = theme === 'Dark' ? 'dark' : 'light';
      console.log('[ThemeContext] Manual theme - effective theme:', newEffective);
      setEffectiveTheme(newEffective);
    }
  }, [theme]);

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    const currentDataTheme = root.getAttribute('data-theme');
    console.log('[ThemeContext] Applying theme to document. Theme:', theme, 'Current data-theme:', currentDataTheme);
    
    if (theme === 'Auto') {
      // Remove data-theme attribute to let CSS media query handle it
      root.removeAttribute('data-theme');
      console.log('[ThemeContext] Removed data-theme attribute (Auto mode)');
    } else if (theme === 'Light') {
      // Explicitly set light theme to override system preference
      root.setAttribute('data-theme', 'light');
      console.log('[ThemeContext] Set data-theme="light"');
    } else {
      // Set explicit dark theme
      root.setAttribute('data-theme', 'dark');
      console.log('[ThemeContext] Set data-theme="dark"');
    }
    
    const newDataTheme = root.getAttribute('data-theme');
    console.log('[ThemeContext] Final data-theme after update:', newDataTheme);
  }, [theme]);

  // Persist theme to localStorage
  const setTheme = (newTheme: Theme) => {
    console.log('[ThemeContext] setTheme called with:', newTheme);
    console.log('[ThemeContext] Current theme before update:', theme);
    setThemeState(newTheme);
    if (typeof window !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      console.log('[ThemeContext] Theme saved to localStorage:', newTheme);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, effectiveTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}


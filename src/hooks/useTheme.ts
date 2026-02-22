import { useThemeStore } from '@/stores/themeStore';

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme() {
  const { theme, setTheme, toggleTheme } = useThemeStore();
  const resolvedTheme = theme === 'system' ? getSystemTheme() : theme;

  return { theme, resolvedTheme, setTheme, toggleTheme };
}

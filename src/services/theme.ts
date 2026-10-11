export type Theme = 'light' | 'dark';

const THEME_KEY = 'semester_theme';

/** Saved choice if there is one, otherwise dark (the app's default look). */
export function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // storage unavailable
  }
  return 'dark';
}

export function applyTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // storage unavailable: the theme still applies for this session
  }
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  window.dispatchEvent(new Event('themechange'));
}
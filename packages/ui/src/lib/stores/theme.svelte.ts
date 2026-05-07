type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'agentforge-theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'dark';
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}

class ThemeStore {
  current = $state<Theme>('dark');

  constructor() {
    if (typeof window !== 'undefined') {
      this.current = getInitialTheme();
      applyTheme(this.current);

      // Listen for system preference changes
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (this.current === 'system') {
          applyTheme('system');
        }
      });
    }
  }

  set(theme: Theme) {
    this.current = theme;
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme(theme);
  }

  toggle() {
    const next = this.current === 'dark' ? 'light' : 'dark';
    this.set(next);
  }

  get isDark(): boolean {
    if (this.current === 'system') {
      if (typeof window === 'undefined') return true;
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return this.current === 'dark';
  }
}

export const themeStore = new ThemeStore();

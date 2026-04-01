import { Injectable } from '@angular/core';

export type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly STORAGE_KEY = 'app-theme';

  /** Call once at app startup to restore the saved theme */
  init(): void {
    const saved = localStorage.getItem(this.STORAGE_KEY) as Theme | null;
    this.apply(saved ?? 'light');
  }

  setTheme(theme: Theme): void {
    this.apply(theme);
    localStorage.setItem(this.STORAGE_KEY, theme);
  }

  getTheme(): Theme {
    return (localStorage.getItem(this.STORAGE_KEY) as Theme) ?? 'light';
  }

  private apply(theme: Theme): void {
    document.documentElement.setAttribute('data-theme', theme);
  }
}
import { useSyncExternalStore } from 'react';
import en from './locales/en.json';
import pl from './locales/pl.json';

// Stage 1 languages. English is the source catalog and the fallback for
// missing keys, so a partial translation never leaves the interface empty.
export type Language = 'en' | 'pl';
export const supportedLanguages: Language[] = ['en', 'pl'];

export function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'pl';
}

const catalogs: Record<Language, Record<string, string>> = { en, pl };

export type TranslateParameters = Record<string, string | number | undefined>;

function detectSystemLanguage(): Language {
  const preferred = typeof navigator === 'undefined' ? '' : navigator.language.toLowerCase();
  return preferred.startsWith('pl') ? 'pl' : 'en';
}

let current: Language = detectSystemLanguage();
const listeners = new Set<() => void>();

export function currentLanguage(): Language { return current; }

export function setLanguage(language: Language): void {
  if (!isLanguage(language) || language === current) return;
  current = language;
  for (const listener of [...listeners]) listener();
}

/** Apply the persisted Settings value; '' or unknown means the system locale. */
export function applyLanguageSetting(setting: string | undefined): void {
  setLanguage(isLanguage(setting) ? setting : detectSystemLanguage());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Re-render the tree on language changes; t() itself stays a plain function. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, currentLanguage, currentLanguage);
}

export function t(key: string, fallback?: string, parameters?: TranslateParameters): string {
  const value = catalogs[current][key] ?? catalogs.en[key] ?? fallback ?? key;
  if (!parameters) return value;
  return value.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (placeholder, name) =>
    Object.hasOwn(parameters, name) ? String(parameters[name] ?? '') : placeholder);
}

// "~20s left" style estimates for the Install Queue. The wording lives in the
// catalogs; the compact units stay language-neutral.
export function formatTimeRemaining(seconds: number): string {
  const rounded = Math.round(seconds);
  if (rounded < 60) return t('downloads.timeLeftSeconds', '~{seconds}s left', { seconds: rounded });
  const minutes = Math.round(rounded / 60);
  if (minutes < 60) return t('downloads.timeLeftMinutes', '~{minutes}m left', { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('downloads.timeLeftHours', '~{hours}h {minutes}m left', { hours, minutes: minutes % 60 });
  return t('downloads.timeLeftDays', '~{days}d {hours}h left', { days: Math.floor(hours / 24), hours: hours % 24 });
}

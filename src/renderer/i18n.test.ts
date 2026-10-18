import { describe, expect, it, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import en from './locales/en.json';
import pl from './locales/pl.json';
import { applyLanguageSetting, formatTimeRemaining, isLanguage, setLanguage, t } from './i18n';

const rendererDir = dirname(fileURLToPath(import.meta.url));
const rendererSources = readdirSync(rendererDir)
  .filter((file) => /\.tsx?$/.test(file) && !/\.test\./.test(file))
  .sort();

beforeEach(() => { applyLanguageSetting('en'); });

describe('t()', () => {
  it('falls back to the English catalog value when no translation exists', () => {
    setLanguage('pl');
    expect(t('nav.settings', 'Settings')).toBe('Ustawienia');
    expect(t('settings.unknownKeyForTest', 'English fallback only')).toBe('English fallback only');
  });

  it('returns the fallback for unknown keys without touching the catalogs', () => {
    expect(t('totally.missing', 'Fallback text')).toBe('Fallback text');
    expect(t('totally.missing')).toBe('totally.missing');
  });

  it('interpolates named parameters placeholders', () => {
    expect(t('common.storeId', 'Store ID {id}', { id: '9N4PT8HGCDHQ' })).toBe('Store ID 9N4PT8HGCDHQ');
    expect(t('store.resultsFor', 'Results for “{query}”', { query: 'forza' })).toContain('forza');
    expect(t('game.updateTitle', 'Update {title}?', { missing: 'x' })).toBe('Update {title}?');
  });

  it('switches catalogs through setLanguage and applyLanguageSetting', () => {
    expect(t('nav.home', 'Home')).toBe('Home');
    setLanguage('pl');
    expect(t('nav.home', 'Home')).toBe('Strona główna');
    applyLanguageSetting('en');
    expect(t('nav.home', 'Home')).toBe('Home');
    applyLanguageSetting('');
    expect(isLanguage('pl')).toBe(true);
    expect(isLanguage('de')).toBe(false);
    expect(isLanguage('')).toBe(false);
  });
});

describe('formatTimeRemaining()', () => {
  it('formats localized estimates from seconds', () => {
    expect(formatTimeRemaining(20)).toBe('~20s left');
    expect(formatTimeRemaining(300)).toBe('~5m left');
    expect(formatTimeRemaining(8192)).toBe('~2h 17m left');
    expect(formatTimeRemaining(90000)).toBe('~1d 1h left');
    setLanguage('pl');
    expect(formatTimeRemaining(20)).toBe('pozostało ~20 s');
    expect(formatTimeRemaining(300)).toBe('pozostało ~5 m');
    expect(formatTimeRemaining(8192)).toBe('pozostało ~2 g 17 m');
    expect(formatTimeRemaining(90000)).toBe('pozostało ~1 d 1 g');
  });
});

describe('translation catalogs', () => {
  it('keeps the same keys in every shipped catalog', () => {
    const enKeys = Object.keys(en).sort();
    expect(Object.keys(pl).sort()).toEqual(enKeys);
    for (const [key, value] of Object.entries(pl)) expect(value, key).not.toBe('');
  });

  it('keeps every t() fallback identical to the English catalog', () => {
    const pair = /\bt\(\s*'([^']+)'\s*,\s*'((?:[^'\\]|\\.)*)'/g;
    for (const file of rendererSources) {
      const source = readFileSync(join(rendererDir, file), 'utf8');
      for (const match of source.matchAll(pair)) {
        const [, key, fallback] = match;
        expect(Object.hasOwn(en, key), key + ' missing from en.json in ' + file).toBe(true);
        expect(en[key as keyof typeof en], 'fallback drift for ' + key + ' in ' + file)
          .toBe(fallback.replace(/\\'/g, "'").replace(/\\\\/g, '\\'));
      }
    }
  });
});

describe('loose UI strings', () => {
  // Heuristic guard: after removing t() calls, renderer sources should not
  // contain user-facing English literals outside the allow list. This catches
  // most regressions when new features land with hardcoded strings.
  const allowList = new Set(['XODUS NEXUS', 'PC', '?', 'Git', 'Cargo', 'Rust 1.99', 'protoc', '—', 'X', 'English', 'Polski', 'Promise', 'null', 'Microsoft Store']); // Promise/type tokens and the JSON storage default are not UI strings
  const hasLetter = (text: string) => /\p{L}/u.test(text);

  function stripTranslatedCalls(source: string): string {
    const call = /\bt\(\s*'(?:[^'\\]|\\.)*'\s*(?:,\s*'(?:[^'\\]|\\.)*'\s*(?:,\s*\{[^{}]*\}\s*)?)?\)/g;
    let previous = source;
    for (let pass = 0; pass < 5; pass += 1) {
      const next = previous.replace(call, '');
      if (next === previous) break;
      previous = next;
    }
    return previous;
  }

  function looseStrings(source: string, file: string): string[] {
    const found: string[] = [];
    const push = (value: string) => {
      const text = value.trim();
      if (!text || !hasLetter(text) || allowList.has(text)) return;
      found.push(text);
    };
    // JSX text nodes only exist in .tsx files. Expression containers
    // ({cond ? <A/> : <B/>}) are removed first so only real element
    // boundaries remain, and a single-line payload keeps TypeScript
    // generics and comparisons (useRef<...>, a > b) out of the scan.
    if (file.endsWith('.tsx')) {
      let textOnly = source;
      for (let pass = 0; pass < 5; pass += 1) {
        const next = textOnly.replace(/\{[^{}]*\}/g, '');
        if (next === textOnly) break;
        textOnly = next;
      }
      for (const match of textOnly.matchAll(/>\s*([^<>{}\n]+?)\s*</g)) push(match[1]);
    }
    for (const match of source.matchAll(/\b(?:title|aria-label|placeholder|alt|label|confirmLabel)=["']([^"']+)["']/g)) push(match[1]);
    for (const match of source.matchAll(/\b(?:message|title|label|confirmLabel)\s*:\s*'([^']+)'/g)) push(match[1]);
    for (const match of source.matchAll(/\btextContent\s*=\s*'([^']+)'/g)) push(match[1]);
    for (const match of source.matchAll(/\?\?\s*'([^']{2,})'/g)) push(match[1]);
    return found;
  }

  it('reports every hardcoded UI string', () => {
    const offenders: string[] = [];
    for (const file of rendererSources) {
      const source = stripTranslatedCalls(readFileSync(join(rendererDir, file), 'utf8'));
      for (const text of looseStrings(source, file)) offenders.push(file + ': ' + JSON.stringify(text));
    }
    expect(offenders).toEqual([]);
  });
});

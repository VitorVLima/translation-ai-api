import { translations, type TranslationKey } from './translations';

export function translate(key: TranslationKey, params: Record<string, string | number> = {}): string {
  return translations[key].replace(/\{(\w+)\}/g, (_match, name: string) => String(params[name] ?? ''));
}

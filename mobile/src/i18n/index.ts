import { type TranslationKey } from './translations';
import { translate } from './translate';

export { translate } from './translate';

export function useI18n() {
  function t(key: TranslationKey, params: Record<string, string | number> = {}): string {
    return translate(key, params);
  }
  return { t };
}

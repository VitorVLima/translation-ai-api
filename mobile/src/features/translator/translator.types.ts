export type TranslationLanguage = 'pt' | 'en';

export type TranslationRequest = {
  text: string;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
};

export type TranslationExample = {
  text: string;
  translation: string;
};

export type TranslationEnrichment = {
  usage: string | null;
  examples: TranslationExample[];
};

export type TranslationResponse = {
  translation: string;
  enrichment: TranslationEnrichment | null;
};

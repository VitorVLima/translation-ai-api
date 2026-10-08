import { authenticatedFetch } from '../../api/authenticated-fetch';
import type {
  TranslationEnrichment,
  TranslationRequest,
  TranslationResponse,
} from './translator.types';

export type TranslationRequestErrorKind = 'validation' | 'http' | 'invalid-response';

export class TranslationRequestError extends Error {
  constructor(
    readonly kind: TranslationRequestErrorKind,
    readonly status: number | null = null,
  ) {
    super(`translation-${kind}`);
    this.name = 'TranslationRequestError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseEnrichment(value: unknown): TranslationEnrichment | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) throw new TranslationRequestError('invalid-response');

  const usage = value.usage;
  if (usage !== undefined && usage !== null && typeof usage !== 'string') {
    throw new TranslationRequestError('invalid-response');
  }
  const rawExamples = value.examples;
  if (rawExamples !== undefined && rawExamples !== null && !Array.isArray(rawExamples)) {
    throw new TranslationRequestError('invalid-response');
  }

  const examples = (Array.isArray(rawExamples) ? rawExamples : [])
    .filter((example): example is Record<string, unknown> => isRecord(example))
    .filter((example) => typeof example.text === 'string' && example.text.trim()
      && typeof example.translation === 'string' && example.translation.trim())
    .slice(0, 3)
    .map((example) => ({
      text: example.text as string,
      translation: example.translation as string,
    }));

  return { usage: typeof usage === 'string' ? usage : null, examples };
}

export function parseTranslationResponse(value: unknown): TranslationResponse {
  if (!isRecord(value) || typeof value.translation !== 'string' || !value.translation.trim()) {
    throw new TranslationRequestError('invalid-response');
  }
  return {
    translation: value.translation,
    enrichment: parseEnrichment(value.enrichment),
  };
}

export function validateTranslationRequest(request: TranslationRequest): string {
  const text = request.text.trim();
  if (!text) throw new TranslationRequestError('validation', 400);
  if (text.length > 5000) throw new TranslationRequestError('validation', 400);
  if (!['pt', 'en'].includes(request.sourceLanguage) || !['pt', 'en'].includes(request.targetLanguage)) {
    throw new TranslationRequestError('validation', 400);
  }
  if (request.sourceLanguage === request.targetLanguage) {
    throw new TranslationRequestError('validation', 400);
  }
  return text;
}

export async function translateText(request: TranslationRequest): Promise<TranslationResponse> {
  const text = validateTranslationRequest(request);
  const response = await authenticatedFetch('/api/v1/translate', {
    body: JSON.stringify({
      text,
      sourceLanguage: request.sourceLanguage,
      targetLanguage: request.targetLanguage,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  if (!response.ok) throw new TranslationRequestError('http', response.status);

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new TranslationRequestError('invalid-response', response.status);
  }
  return parseTranslationResponse(body);
}

export function getTranslationErrorMessage(error: unknown): string {
  if (error instanceof TranslationRequestError) {
    if (error.kind === 'validation') return 'Confira o texto e escolha idiomas diferentes.';
    if (error.status === 503) return 'O serviço de tradução está temporariamente indisponível.';
    if (error.status === 400) return 'Não foi possível traduzir este texto. Confira os dados enviados.';
    if (error.kind === 'invalid-response') return 'A tradução retornou uma resposta inválida.';
  }
  return 'Não foi possível traduzir agora. Tente novamente.';
}

export function getLanguageLabel(language: 'pt' | 'en'): string {
  return language === 'pt' ? 'Português' : 'Inglês';
}

export function getTranslationPlaceholder(language: 'pt' | 'en'): string {
  return language === 'pt' ? 'Digite o texto em português...' : 'Digite o texto em inglês...';
}

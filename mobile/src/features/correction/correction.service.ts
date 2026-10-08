import { authenticatedFetch } from '../../api/authenticated-fetch';
import type { CorrectionExample, CorrectionRequest, CorrectionResponse, CorrectionStatus } from './correction.types';

const MAX_CHARACTERS = 5000;
const STATUSES: CorrectionStatus[] = ['CORRECTED', 'CORRECT_WITH_SUGGESTIONS', 'CORRECT'];

export class CorrectionRequestError extends Error {
  constructor(
    readonly kind: 'validation' | 'http' | 'invalid-response',
    readonly status: number | null = null,
  ) {
    super(`correction-${kind}`);
    this.name = 'CorrectionRequestError';
  }
}

function isExample(value: unknown): value is CorrectionExample {
  if (!value || typeof value !== 'object') return false;
  const example = value as Partial<CorrectionExample>;
  return typeof example.text === 'string' && example.text.trim().length > 0 &&
    typeof example.translation === 'string' && example.translation.trim().length > 0;
}

export function parseCorrectionResponse(value: unknown): CorrectionResponse {
  if (!value || typeof value !== 'object') throw new CorrectionRequestError('invalid-response');
  const response = value as Partial<CorrectionResponse>;
  if (typeof response.correctedText !== 'string' || !response.correctedText.trim()) {
    throw new CorrectionRequestError('invalid-response');
  }
  if (typeof response.status !== 'string' || !STATUSES.includes(response.status as CorrectionStatus)) {
    throw new CorrectionRequestError('invalid-response');
  }
  const explanation = response.explanation === null || typeof response.explanation === 'string' ? response.explanation : null;
  const usageTip = response.usageTip === null || typeof response.usageTip === 'string' ? response.usageTip : null;
  const alternatives = Array.isArray(response.alternatives)
    ? response.alternatives.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 3)
    : [];
  const examples = Array.isArray(response.examples)
    ? response.examples.filter(isExample).slice(0, 3)
    : [];
  return { correctedText: response.correctedText, status: response.status as CorrectionStatus, explanation, usageTip, alternatives, examples };
}

export async function correctText(text: string): Promise<CorrectionResponse> {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > MAX_CHARACTERS) throw new CorrectionRequestError('validation');
  const request: CorrectionRequest = { text: trimmed, language: 'en' };
  let response: Response;
  try {
    response = await authenticatedFetch('/api/v1/correct', {
      body: JSON.stringify(request),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  } catch {
    throw new CorrectionRequestError('http');
  }
  if (!response.ok) throw new CorrectionRequestError('http', response.status);
  try {
    return parseCorrectionResponse(await response.json());
  } catch (error) {
    if (error instanceof CorrectionRequestError) throw error;
    throw new CorrectionRequestError('invalid-response', response.status);
  }
}

export function getCorrectionErrorMessage(error: unknown): string {
  if (!(error instanceof CorrectionRequestError)) return 'Não foi possível conectar ao serviço de correção. Tente novamente.';
  if (error.kind === 'validation') return 'Digite um texto em inglês de até 5000 caracteres.';
  if (error.status === 400) return 'Confira o texto informado e tente novamente.';
  if (error.status === 503) return 'A correção está temporariamente indisponível.';
  return 'Não foi possível corrigir o texto. Tente novamente.';
}

export function getCorrectionTitle(status: CorrectionStatus): string {
  return status === 'CORRECT' ? 'Seu texto já está correto' : 'Texto corrigido';
}

export const CORRECTION_MAX_CHARACTERS = MAX_CHARACTERS;

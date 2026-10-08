import { authenticatedFetch } from '../../api/authenticated-fetch';

// POST /api/v1/translate returns enrichment too; the chat displays only the translation.
type TranslationResponse = {
  translation: string;
  enrichment: { usage: string | null; examples: { text: string; translation: string }[] } | null;
};

export async function translateAssistantMessage(text: string): Promise<string> {
  const response = await authenticatedFetch('/api/v1/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, sourceLanguage: 'en', targetLanguage: 'pt' }),
  });
  if (!response.ok) throw new Error('translation-failed');
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || typeof (body as TranslationResponse).translation !== 'string'
    || !(body as TranslationResponse).translation.trim()) throw new Error('translation-invalid-response');
  return (body as TranslationResponse).translation;
}

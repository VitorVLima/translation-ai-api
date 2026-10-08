import { authenticatedFetch } from '../../api/authenticated-fetch';
import { File } from 'expo-file-system';

export type RecordedAudio = {
  uri: string;
  name: string;
  mimeType: string;
};

export type Transcription = {
  text: string;
  language: 'en' | 'pt';
};

export type SpeechLanguage = 'en' | 'pt';

export type ConversationAudioOperation = 'transcription' | 'speech';

export class ConversationAudioRequestError extends Error {
  constructor(
    readonly operation: ConversationAudioOperation,
    readonly status: number | null,
    readonly kind: 'network' | 'http' | 'invalid-response',
  ) {
    super(`conversation-${operation}-failed`);
    this.name = 'ConversationAudioRequestError';
  }
}

function recordingMetadata(audio: RecordedAudio): {
  extension: string;
  contentType: string;
  size: number | null;
} {
  const extension = audio.name.includes('.') ? audio.name.slice(audio.name.lastIndexOf('.')).toLowerCase() : '';
  try {
    const file = new File(audio.uri);
    return { extension, contentType: audio.mimeType, size: file.exists ? file.size : null };
  } catch {
    return { extension, contentType: audio.mimeType, size: null };
  }
}

function traceAudio(event: string, details?: Record<string, string | number | boolean | null>): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.info(`[STT] ${event}`, details);
}

function isTranscription(value: unknown): value is Transcription {
  if (!value || typeof value !== 'object') return false;
  const transcription = value as Partial<Transcription>;
  return typeof transcription.text === 'string' && typeof transcription.language === 'string' &&
    (transcription.language === 'en' || transcription.language === 'pt');
}

export async function transcribeConversationAudio(audio: RecordedAudio, language: SpeechLanguage = 'en'): Promise<Transcription> {
  traceAudio('upload', recordingMetadata(audio));
  let formData: FormData;
  try {
    formData = new FormData();
    // Expo SDK 57 File implements Blob. Passing it directly lets expo/fetch read
    // the app-private file:// URI on Android and produce the multipart boundary.
    const file = new File(audio.uri);
    formData.append('file', file, audio.name);
    formData.append('language', language);
    traceAudio('multipart-ready', { size: file.size, mimeType: file.type, language });
  } catch (error) {
    traceAudio('multipart-error');
    throw error;
  }

  let response: Response;
  try {
    response = await authenticatedFetch('/api/v1/transcriptions', { body: formData, method: 'POST' });
  } catch {
    traceAudio('request-error');
    throw new ConversationAudioRequestError('transcription', null, 'network');
  }
  if (!response.ok) {
    traceAudio('response-error', { status: response.status });
    throw new ConversationAudioRequestError('transcription', response.status, 'http');
  }
  traceAudio('response', { status: response.status });

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ConversationAudioRequestError('transcription', response.status, 'invalid-response');
  }
  if (!isTranscription(body)) {
    throw new ConversationAudioRequestError('transcription', response.status, 'invalid-response');
  }
  return body;
}

async function requestSpeech(text: string, language: SpeechLanguage, conversationId?: string): Promise<ArrayBuffer> {
  if (text.length > 3000) throw new ConversationAudioRequestError('speech', 400, 'http');
  const body: { text: string; language: SpeechLanguage; conversationId?: string } = {
    language,
    text,
    ...(conversationId ? { conversationId } : {}),
  };
  let response: Response;
  try {
    response = await authenticatedFetch('/api/v1/speech', {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  } catch {
    throw new ConversationAudioRequestError('speech', null, 'network');
  }
  if (!response.ok || !response.headers.get('Content-Type')?.toLowerCase().startsWith('audio/wav')) {
    throw new ConversationAudioRequestError('speech', response.status, 'http');
  }

  try {
    const audio = await response.arrayBuffer();
    if (audio.byteLength === 0) throw new Error('empty-audio');
    return audio;
  } catch {
    throw new ConversationAudioRequestError('speech', response.status, 'invalid-response');
  }
}

export function synthesizeSpeech(text: string, conversationId?: string): Promise<ArrayBuffer> {
  return requestSpeech(text, 'en', conversationId);
}

export function synthesizeSpeechForLanguage(text: string, language: SpeechLanguage): Promise<ArrayBuffer> {
  return requestSpeech(text, language);
}

export function synthesizeConversationSpeech(conversationId: string, text: string): Promise<ArrayBuffer> {
  return requestSpeech(text, 'en', conversationId);
}

export function removeTemporaryAudio(uri: string): void {
  try { new File(uri).delete(); } catch { /* The system cache can remove files at any time. */ }
}

export function getConversationAudioErrorMessage(error: unknown): string {
  if (!(error instanceof ConversationAudioRequestError)) return 'Não foi possível conectar ao serviço de voz. Tente novamente.';
  if (error.operation === 'transcription') {
    if (error.status === 413) return 'O áudio gravado é muito grande. Grave uma mensagem mais curta.';
    if (error.status === 415) return 'O formato do áudio não é compatível. Tente gravar novamente.';
    if (error.status === 429) return 'Muitas solicitações de voz. Aguarde um pouco e tente novamente.';
    if (error.status === 503) return 'O reconhecimento de voz está temporariamente indisponível.';
    if (error.status === 400) return 'Não foi possível processar o áudio gravado.';
    return 'Não foi possível transcrever sua fala. Tente novamente.';
  }
  if (error.status === 429) return 'Muitas solicitações de voz. Aguarde um pouco e tente novamente.';
  if (error.status === 503) return 'A reprodução por voz está temporariamente indisponível.';
  return 'Não foi possível reproduzir o áudio.';
}

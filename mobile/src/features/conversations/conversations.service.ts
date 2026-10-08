import { authenticatedFetch } from '../../api/authenticated-fetch';
import type {
  ConversationDetail,
  ConversationDifficulty,
  ConversationEvaluation,
  ConversationEvaluationScores,
  ConversationLanguage,
  ConversationMode,
  ConversationMessage,
  ConversationScenario,
  ConversationSummary,
  CreateConversationRequest,
  SendConversationMessageResponse,
} from './conversations.types';

const DIFFICULTIES: ConversationDifficulty[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const LANGUAGES: ConversationLanguage[] = ['en', 'pt'];
const MODES: ConversationMode[] = ['TEXT', 'VOICE'];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export class ConversationsLoadError extends Error {
  constructor() {
    super('conversations-load-failed');
    this.name = 'ConversationsLoadError';
  }
}

export class ConversationCreateError extends Error {
  constructor(readonly status: number | null, readonly kind: 'network' | 'http' | 'invalid-response') {
    super('conversation-create-failed');
    this.name = 'ConversationCreateError';
  }
}

export type ConversationRequestOperation = 'detail' | 'message' | 'complete' | 'delete';

export class ConversationRequestError extends Error {
  constructor(
    readonly operation: ConversationRequestOperation,
    readonly status: number | null,
    readonly kind: 'network' | 'http' | 'invalid-response',
  ) {
    super(`conversation-${operation}-failed`);
    this.name = 'ConversationRequestError';
  }
}

export function isConversationSummary(value: unknown): value is ConversationSummary {
  if (!value || typeof value !== 'object') return false;
  const conversation = value as Partial<ConversationSummary>;
  return typeof conversation.id === 'string' && UUID_PATTERN.test(conversation.id) &&
    typeof conversation.scenario === 'string' &&
    LANGUAGES.includes(conversation.language as ConversationLanguage) &&
    DIFFICULTIES.includes(conversation.difficulty as ConversationDifficulty) &&
    MODES.includes(conversation.interactionMode as ConversationMode) &&
    typeof conversation.title === 'string' &&
    typeof conversation.scenarioDisplayName === 'string' &&
    typeof conversation.description === 'string' &&
    typeof conversation.assistantDisplayName === 'string' &&
    typeof conversation.assistantAvatarKey === 'string' &&
    typeof conversation.assistantAvatarImageUrl === 'string' &&
    isTimestamp(conversation.createdAt) &&
    isTimestamp(conversation.updatedAt) &&
    (conversation.endedAt === null || isTimestamp(conversation.endedAt));
}

export function isConversationMessage(value: unknown): value is ConversationMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<ConversationMessage>;
  return typeof message.id === 'string' && UUID_PATTERN.test(message.id) &&
    (message.role === 'USER' || message.role === 'ASSISTANT') &&
    typeof message.content === 'string' &&
    (message.correctedText === null || typeof message.correctedText === 'string') &&
    isTimestamp(message.createdAt);
}

function isEvaluationScores(value: unknown): value is ConversationEvaluationScores {
  if (!value || typeof value !== 'object') return false;
  const scores = value as Partial<ConversationEvaluationScores>;
  return ['communication', 'grammar', 'vocabulary', 'fluency', 'overall']
    .every((field) => {
      const score = scores[field as keyof ConversationEvaluationScores];
      return typeof score === 'number' && Number.isInteger(score) && score >= 0 && score <= 100;
    }) &&
    (scores.relevance === null || (typeof scores.relevance === 'number' && Number.isInteger(scores.relevance) && scores.relevance >= 0 && scores.relevance <= 100));
}

function isFeedbackList(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 3 && value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 500);
}

export function isConversationEvaluation(value: unknown): value is ConversationEvaluation {
  if (!value || typeof value !== 'object') return false;
  const evaluation = value as Partial<ConversationEvaluation>;
  if (typeof evaluation.conversationId !== 'string' || !UUID_PATTERN.test(evaluation.conversationId)) return false;
  if (evaluation.status === 'INSUFFICIENT') {
    const minimumUserMessages = evaluation.minimumUserMessages;
    const currentUserMessages = evaluation.currentUserMessages;
    return evaluation.scores === undefined && evaluation.strengths === undefined && evaluation.improvements === undefined &&
      evaluation.evaluatedAt === undefined && typeof minimumUserMessages === 'number' && Number.isInteger(minimumUserMessages) && minimumUserMessages >= 0 &&
      typeof currentUserMessages === 'number' && Number.isInteger(currentUserMessages) && currentUserMessages >= 0;
  }
  return (evaluation.status === 'SUCCESS' || evaluation.status === 'NEEDS_PRACTICE') &&
    isEvaluationScores(evaluation.scores) && isFeedbackList(evaluation.strengths) &&
    isFeedbackList(evaluation.improvements) && isTimestamp(evaluation.evaluatedAt) &&
    evaluation.minimumUserMessages === undefined && evaluation.currentUserMessages === undefined;
}

export function isConversationDetail(value: unknown): value is ConversationDetail {
  if (!value || typeof value !== 'object') return false;
  const detail = value as Partial<ConversationDetail>;
  return isConversationSummary(detail.conversation) &&
    Array.isArray(detail.messages) &&
    detail.messages.every(isConversationMessage) &&
    Object.prototype.hasOwnProperty.call(value, 'evaluation') &&
    (detail.evaluation === null || isConversationEvaluation(detail.evaluation));
}

export function isSendConversationMessageResponse(value: unknown): value is SendConversationMessageResponse {
  if (!value || typeof value !== 'object') return false;
  const response = value as Partial<SendConversationMessageResponse>;
  return typeof response.reply === 'string' && response.reply.trim().length > 0 &&
    typeof response.hasCorrection === 'boolean' &&
    (response.correctedText === null || typeof response.correctedText === 'string') &&
    (!response.hasCorrection || Boolean(response.correctedText?.trim()));
}

function isConversationScenario(value: unknown): value is ConversationScenario {
  if (!value || typeof value !== 'object') return false;
  const scenario = value as Partial<ConversationScenario>;
  return typeof scenario.id === 'string' &&
    /^[A-Z][A-Z0-9_]{2,63}$/.test(scenario.id) &&
    typeof scenario.displayName === 'string' &&
    typeof scenario.description === 'string' &&
    typeof scenario.assistantDisplayName === 'string' &&
    typeof scenario.assistantAvatarKey === 'string' &&
    typeof scenario.assistantAvatarImageUrl === 'string';
}

export async function getConversations(signal?: AbortSignal): Promise<ConversationSummary[]> {
  const response = await authenticatedFetch('/api/v1/conversations', { signal });
  if (!response.ok) throw new ConversationsLoadError();

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ConversationsLoadError();
  }
  if (!Array.isArray(body) || !body.every(isConversationSummary)) {
    throw new ConversationsLoadError();
  }
  return body;
}

export async function getConversationScenarios(signal?: AbortSignal): Promise<ConversationScenario[]> {
  const response = await authenticatedFetch('/api/v1/conversation-scenarios', { signal });
  if (!response.ok) throw new ConversationsLoadError();

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ConversationsLoadError();
  }
  if (!Array.isArray(body) || !body.every(isConversationScenario)) {
    throw new ConversationsLoadError();
  }
  return body;
}

export async function createConversation(
  request: CreateConversationRequest,
  signal?: AbortSignal,
): Promise<ConversationSummary> {
  let response: Response;
  try {
    response = await authenticatedFetch('/api/v1/conversations', {
      body: JSON.stringify(request),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal,
    });
  } catch {
    throw new ConversationCreateError(null, 'network');
  }
  if (response.status !== 201) throw new ConversationCreateError(response.status, 'http');

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ConversationCreateError(response.status, 'invalid-response');
  }
  if (!isConversationSummary(body)) throw new ConversationCreateError(response.status, 'invalid-response');
  return body;
}

export async function getConversation(
  conversationId: string,
  signal?: AbortSignal,
): Promise<ConversationDetail> {
  let response: Response;
  try {
    response = await authenticatedFetch(`/api/v1/conversations/${encodeURIComponent(conversationId)}`, { signal });
  } catch {
    throw new ConversationRequestError('detail', null, 'network');
  }
  if (!response.ok) throw new ConversationRequestError('detail', response.status, 'http');

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ConversationRequestError('detail', response.status, 'invalid-response');
  }
  if (!isConversationDetail(body) || body.conversation.id !== conversationId) {
    throw new ConversationRequestError('detail', response.status, 'invalid-response');
  }
  return body;
}

export async function sendConversationMessage(
  conversationId: string,
  message: string,
  signal?: AbortSignal,
): Promise<SendConversationMessageResponse> {
  let response: Response;
  try {
    response = await authenticatedFetch(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
      body: JSON.stringify({ message }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      signal,
    });
  } catch {
    throw new ConversationRequestError('message', null, 'network');
  }
  if (!response.ok) throw new ConversationRequestError('message', response.status, 'http');

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ConversationRequestError('message', response.status, 'invalid-response');
  }
  if (!isSendConversationMessageResponse(body)) {
    throw new ConversationRequestError('message', response.status, 'invalid-response');
  }
  return body;
}

export async function completeConversation(
  conversationId: string,
  signal?: AbortSignal,
): Promise<ConversationEvaluation> {
  let response: Response;
  try {
    response = await authenticatedFetch(`/api/v1/conversations/${encodeURIComponent(conversationId)}/complete`, {
      method: 'POST',
      signal,
    });
  } catch {
    throw new ConversationRequestError('complete', null, 'network');
  }
  if (!response.ok) throw new ConversationRequestError('complete', response.status, 'http');

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ConversationRequestError('complete', response.status, 'invalid-response');
  }
  if (!isConversationEvaluation(body) || body.conversationId !== conversationId) {
    throw new ConversationRequestError('complete', response.status, 'invalid-response');
  }
  return body;
}

export async function deleteConversation(
  conversationId: string,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await authenticatedFetch(`/api/v1/conversations/${encodeURIComponent(conversationId)}`, {
      method: 'DELETE',
      signal,
    });
  } catch {
    throw new ConversationRequestError('delete', null, 'network');
  }
  if (response.status !== 204) throw new ConversationRequestError('delete', response.status, 'http');
}

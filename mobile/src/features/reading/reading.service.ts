import { authenticatedFetch } from '../../api/authenticated-fetch';
import { SessionError } from '../auth/auth.session';
import type {
  ReadingActivityDetail,
  ReadingActivityStatus,
  ReadingActivitySummary,
  ReadingAnswer,
  ReadingDifficulty,
  ReadingGenerateResponse,
  ReadingHint,
  ReadingQuestion,
  ReadingQuestionType,
  ReadingSubmissionResult,
  ReadingTopic,
  ReadingTranslation,
} from './reading.types';

const DIFFICULTIES: ReadingDifficulty[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const TOPICS: ReadingTopic[] = ['DAILY_LIFE', 'TRAVEL', 'WORK', 'TECHNOLOGY', 'CULTURE', 'RANDOM'];
const STATUSES: ReadingActivityStatus[] = ['IN_PROGRESS', 'SUCCESS', 'NEEDS_PRACTICE'];
const QUESTION_TYPES: ReadingQuestionType[] = ['MAIN_IDEA', 'DETAIL', 'VOCABULARY'];
const HINT_TYPES = ['VOCABULARY', 'PHRASAL_VERB', 'EXPRESSION', 'IDIOM', 'GRAMMAR', 'PRONUNCIATION'] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReadingOperation = 'list' | 'detail' | 'generate' | 'hint' | 'translation' | 'delete' | 'questions' | 'submit';

export class ReadingRequestError extends Error {
  constructor(readonly operation: ReadingOperation, readonly status: number | null, readonly kind: 'network' | 'http' | 'invalid-response') {
    super(`reading-${operation}-failed`);
    this.name = 'ReadingRequestError';
  }
}

function traceReading(event: string, details: Record<string, string | number | boolean>): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.info(`[READING] ${event}`, details);
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function nullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value));
}

function readingTitle(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 120;
}

function parseSummary(value: unknown): ReadingActivitySummary | null {
  const summary = object(value);
  if (!summary || !uuid(summary.activityId) || !readingTitle(summary.title) || !DIFFICULTIES.includes(summary.difficulty as ReadingDifficulty) ||
      !TOPICS.includes(summary.topic as ReadingTopic) || !STATUSES.includes(summary.status as ReadingActivityStatus) ||
      typeof summary.questionCount !== 'number' || !Number.isInteger(summary.questionCount) || summary.questionCount < 0 ||
      !nullableNumber(summary.correctAnswers) || !nullableNumber(summary.comprehensionPercentage) ||
      !timestamp(summary.createdAt) || (summary.completedAt !== null && !timestamp(summary.completedAt))) return null;
  return {
    activityId: summary.activityId,
    title: summary.title.trim(),
    difficulty: summary.difficulty as ReadingDifficulty,
    topic: summary.topic as ReadingTopic,
    status: summary.status as ReadingActivityStatus,
    questionCount: summary.questionCount,
    correctAnswers: summary.correctAnswers,
    comprehensionPercentage: summary.comprehensionPercentage,
    createdAt: summary.createdAt,
    completedAt: summary.completedAt as string | null,
  };
}

function parseQuestion(value: unknown, feedbackRequired = false): ReadingQuestion | null {
  const question = object(value);
  if (!question || !uuid(question.id) || !QUESTION_TYPES.includes(question.type as ReadingQuestionType) ||
      typeof question.question !== 'string' || !question.question.trim() || !Array.isArray(question.options) ||
      question.options.length !== 4 || question.options.some((option) => typeof option !== 'string' || !option.trim()) ||
      (question.correctOption !== undefined && question.correctOption !== null &&
        (typeof question.correctOption !== 'number' || !Number.isInteger(question.correctOption) || question.correctOption < 0 || question.correctOption > 3)) ||
      (question.explanation !== undefined && question.explanation !== null && typeof question.explanation !== 'string') ||
      ((question.correctOption === undefined || question.correctOption === null) !==
        (question.explanation === undefined || question.explanation === null)) ||
      (feedbackRequired && (question.correctOption === undefined || question.correctOption === null ||
        typeof question.explanation !== 'string' || !question.explanation.trim()))) return null;
  return {
    id: question.id,
    type: question.type as ReadingQuestionType,
    question: question.question,
    options: question.options as string[],
    correctOption: typeof question.correctOption === 'number' ? question.correctOption : null,
    explanation: typeof question.explanation === 'string' ? question.explanation : null,
  };
}

export function parseReadingActivityList(value: unknown): ReadingActivitySummary[] | null {
  if (!Array.isArray(value)) return null;
  const activities = value.map(parseSummary);
  return activities.some((activity) => activity === null) ? null : activities as ReadingActivitySummary[];
}

export function parseReadingActivityDetail(value: unknown): ReadingActivityDetail | null {
  const detail = object(value);
  const summary = parseSummary(detail);
  if (!detail || !summary || typeof detail.text !== 'string' || !detail.text.trim() || !Array.isArray(detail.questions)) return null;
  const questions = detail.questions.map((question) => parseQuestion(question, summary.status !== 'IN_PROGRESS'));
  if (questions.some((question) => question === null)) return null;
  const hints = detail.hints == null ? null : parseReadingHints({ items: detail.hints });
  if (detail.hints != null && hints === null) return null;
  return { ...summary, text: detail.text, questions: questions as ReadingQuestion[], hints };
}

export function parseReadingGenerateResponse(value: unknown): ReadingGenerateResponse | null {
  const reading = object(value);
  if (!reading || !uuid(reading.activityId) || !readingTitle(reading.title) || typeof reading.text !== 'string' || !reading.text.trim() ||
      !DIFFICULTIES.includes(reading.difficulty as ReadingDifficulty) || !TOPICS.includes(reading.topic as ReadingTopic)) return null;
  return { activityId: reading.activityId, title: reading.title.trim(), text: reading.text, difficulty: reading.difficulty as ReadingDifficulty, topic: reading.topic as ReadingTopic };
}

export function parseReadingQuestions(value: unknown): ReadingQuestion[] | null {
  const result = object(value);
  if (!result || !Array.isArray(result.questions) || result.questions.length !== 3) return null;
  const questions = result.questions.map((question) => parseQuestion(question));
  return questions.some((question) => question === null) ? null : questions as ReadingQuestion[];
}

export function parseReadingSubmissionResult(value: unknown): ReadingSubmissionResult | null {
  const result = object(value);
  if (!result || !uuid(result.activityId) || !DIFFICULTIES.includes(result.difficulty as ReadingDifficulty) ||
      !STATUSES.includes(result.status as ReadingActivityStatus) ||
      typeof result.correctAnswers !== 'number' || !Number.isInteger(result.correctAnswers) || result.correctAnswers < 0 || result.correctAnswers > 3 ||
      typeof result.totalQuestions !== 'number' || result.totalQuestions !== 3 ||
      typeof result.percentage !== 'number' || !Number.isInteger(result.percentage) || result.percentage < 0 || result.percentage > 100) return null;
  return {
    activityId: result.activityId,
    correctAnswers: result.correctAnswers,
    totalQuestions: result.totalQuestions,
    percentage: result.percentage,
    status: result.status as ReadingActivityStatus,
    difficulty: result.difficulty as ReadingDifficulty,
  };
}

export function parseReadingHints(value: unknown): ReadingHint[] | null {
  const result = object(value);
  if (!result || !Array.isArray(result.items)) return null;
  const items = result.items.slice(0, 10).filter((item): item is Record<string, unknown> => {
    const candidate = object(item);
    return Boolean(candidate && typeof candidate.expression === 'string' && candidate.expression.trim() &&
      typeof candidate.explanation === 'string' && candidate.explanation.trim() && HINT_TYPES.includes(candidate.type as typeof HINT_TYPES[number]));
  }).map((item) => ({ expression: item.expression as string, explanation: item.explanation as string, type: item.type as ReadingHint['type'] }));
  return items;
}

async function readJson(response: Response, operation: ReadingOperation): Promise<unknown> {
  try { return await response.json(); } catch { throw new ReadingRequestError(operation, response.status, 'invalid-response'); }
}

async function postJson(path: string, operation: ReadingOperation, body: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await authenticatedFetch(path, { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }, method: 'POST' });
  } catch (error) {
    // A session failure belongs to the shared auth flow. Feature/network
    // failures stay local to Reading and are rendered with retry feedback.
    if (error instanceof SessionError && error.kind === 'invalid') throw error;
    throw new ReadingRequestError(operation, null, 'network');
  }
  if (!response.ok) throw new ReadingRequestError(operation, response.status, 'http');
  return readJson(response, operation);
}

export async function getReadingActivities(signal?: AbortSignal): Promise<ReadingActivitySummary[]> {
  let response: Response;
  traceReading('request', { hasSignal: Boolean(signal), method: 'GET', path: '/api/v1/reading' });
  try { response = await authenticatedFetch('/api/v1/reading', { signal }); }
  catch (error) {
    traceReading('request-failed', {
      kind: error instanceof SessionError ? error.kind : 'unknown',
      path: '/api/v1/reading',
    });
    if (error instanceof SessionError && error.kind === 'invalid') throw error;
    throw new ReadingRequestError('list', null, 'network');
  }
  traceReading('response', { path: '/api/v1/reading', status: response.status });
  if (!response.ok) throw new ReadingRequestError('list', response.status, 'http');
  const parsed = parseReadingActivityList(await readJson(response, 'list'));
  if (!parsed) throw new ReadingRequestError('list', response.status, 'invalid-response');
  return parsed;
}

export async function getReadingActivity(activityId: string, signal?: AbortSignal): Promise<ReadingActivityDetail> {
  let response: Response;
  try { response = await authenticatedFetch(`/api/v1/reading/${encodeURIComponent(activityId)}`, { signal }); }
  catch (error) {
    if (error instanceof SessionError && error.kind === 'invalid') throw error;
    throw new ReadingRequestError('detail', null, 'network');
  }
  if (!response.ok) throw new ReadingRequestError('detail', response.status, 'http');
  const parsed = parseReadingActivityDetail(await readJson(response, 'detail'));
  if (!parsed || parsed.activityId !== activityId) throw new ReadingRequestError('detail', response.status, 'invalid-response');
  return parsed;
}

export async function deleteReadingActivity(activityId: string): Promise<void> {
  let response: Response;
  try {
    response = await authenticatedFetch(`/api/v1/reading/${encodeURIComponent(activityId)}`, { method: 'DELETE' });
  } catch (error) {
    if (error instanceof SessionError && error.kind === 'invalid') throw error;
    throw new ReadingRequestError('delete', null, 'network');
  }
  if (!response.ok) throw new ReadingRequestError('delete', response.status, 'http');
}

export async function getReadingQuestions(activityId: string): Promise<ReadingQuestion[]> {
  const parsed = parseReadingQuestions(await postJson('/api/v1/reading/questions', 'questions', { activityId }));
  if (!parsed) throw new ReadingRequestError('questions', 200, 'invalid-response');
  return parsed;
}

export async function submitReadingAnswers(activityId: string, answers: ReadingAnswer[]): Promise<ReadingSubmissionResult> {
  const parsed = parseReadingSubmissionResult(await postJson(`/api/v1/reading/${encodeURIComponent(activityId)}/submit`, 'submit', { answers }));
  if (!parsed || parsed.activityId !== activityId) throw new ReadingRequestError('submit', 200, 'invalid-response');
  return parsed;
}

export async function generateReading(difficulty: ReadingDifficulty, topic: ReadingTopic): Promise<ReadingGenerateResponse> {
  const parsed = parseReadingGenerateResponse(await postJson('/api/v1/reading/generate', 'generate', { difficulty, topic }));
  if (!parsed || parsed.difficulty !== difficulty || parsed.topic !== topic) throw new ReadingRequestError('generate', 200, 'invalid-response');
  return parsed;
}

export async function getReadingHints(text: string, difficulty: ReadingDifficulty): Promise<ReadingHint[]> {
  const parsed = parseReadingHints(await postJson('/api/v1/reading/hint', 'hint', { text, difficulty }));
  if (!parsed) throw new ReadingRequestError('hint', 200, 'invalid-response');
  return parsed;
}

export async function getReadingHintsForActivity(activityId: string): Promise<ReadingHint[]> {
  let response: Response;
  try { response = await authenticatedFetch(`/api/v1/reading/${encodeURIComponent(activityId)}/hints`); }
  catch (error) {
    if (error instanceof SessionError && error.kind === 'invalid') throw error;
    throw new ReadingRequestError('hint', null, 'network');
  }
  if (!response.ok) throw new ReadingRequestError('hint', response.status, 'http');
  const parsed = parseReadingHints(await readJson(response, 'hint'));
  if (!parsed) throw new ReadingRequestError('hint', response.status, 'invalid-response');
  return parsed;
}

export async function translateReading(text: string): Promise<ReadingTranslation> {
  const result = object(await postJson('/api/v1/translate', 'translation', { text, sourceLanguage: 'en', targetLanguage: 'pt' }));
  if (!result || typeof result.translation !== 'string' || !result.translation.trim()) throw new ReadingRequestError('translation', 200, 'invalid-response');
  return { translation: result.translation };
}

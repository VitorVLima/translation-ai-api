import { authenticatedFetch } from '../../api/authenticated-fetch';
import type { EnglishLevel } from '../profile/profile.types';
import type {
  DailyVocabularyLesson,
  DailyVocabularyWord,
  VocabularyEvaluationResult,
  VocabularyLessonProgress,
  VocabularyQuizAnswer,
  VocabularyQuizResult,
  VocabularyProgressStatus,
} from './vocabulary.types';

const ENGLISH_LEVELS: EnglishLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const WORD_STATUSES: VocabularyProgressStatus[] = ['NEW', 'REVIEWING', 'LEARNED', 'MASTERED'];
const WORDS_PER_LESSON = 10;

export class VocabularyLoadError extends Error {
  constructor() {
    super('vocabulary-load-failed');
    this.name = 'VocabularyLoadError';
  }
}

export class VocabularyActionError extends Error {
  constructor(readonly operation: 'quiz' | 'evaluate', readonly status: number | null) {
    super(`vocabulary-${operation}-failed`);
    this.name = 'VocabularyActionError';
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

export function parseDailyVocabularyWord(value: unknown): DailyVocabularyWord | null {
  const word = object(value);
  if (!word || typeof word.id !== 'string' || typeof word.word !== 'string' ||
      typeof word.translation !== 'string' ||
      !WORD_STATUSES.includes(word.status as VocabularyProgressStatus) ||
      typeof word.review !== 'boolean') return null;
  return {
    id: word.id,
    word: word.word,
    translation: word.translation,
    example: typeof word.example === 'string' ? word.example : null,
    exampleTranslation: typeof word.exampleTranslation === 'string' ? word.exampleTranslation : null,
    category: typeof word.category === 'string' ? word.category : null,
    status: word.status as VocabularyProgressStatus,
    review: word.review,
  };
}

export function parseDailyVocabularyLesson(value: unknown): DailyVocabularyLesson | null {
  const lesson = object(value);
  const progress = object(lesson?.progress);
  if (!lesson || typeof lesson.id !== 'string' || typeof lesson.date !== 'string' ||
      !ENGLISH_LEVELS.includes(lesson.englishLevel as EnglishLevel) ||
      typeof lesson.category !== 'string' || !Array.isArray(lesson.words) ||
      lesson.words.length !== WORDS_PER_LESSON || !progress ||
      typeof progress.quizCompleted !== 'boolean' ||
      !(progress.quizScore === null || (typeof progress.quizScore === 'number' && Number.isInteger(progress.quizScore))) ||
      typeof progress.writingCompleted !== 'boolean' ||
      !(progress.completedAt === null || typeof progress.completedAt === 'string')) return null;
  const words = lesson.words.map(parseDailyVocabularyWord);
  if (words.some((word) => word === null)) return null;
  return {
    id: lesson.id,
    date: lesson.date,
    englishLevel: lesson.englishLevel as EnglishLevel,
    category: lesson.category,
    words: words as DailyVocabularyWord[],
    progress: {
      quizCompleted: progress.quizCompleted as boolean,
      quizScore: progress.quizScore as number | null,
      writingCompleted: progress.writingCompleted as boolean,
      completedAt: progress.completedAt as string | null,
    },
  };
}

export async function getDailyVocabulary(signal?: AbortSignal): Promise<DailyVocabularyLesson> {
  const response = await authenticatedFetch('/api/v1/vocabulary/today', { signal });
  if (!response.ok) throw new VocabularyLoadError();
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new VocabularyLoadError();
  }
  const lesson = parseDailyVocabularyLesson(body);
  if (!lesson) throw new VocabularyLoadError();
  return lesson;
}

function parseProgress(value: unknown): VocabularyLessonProgress | null {
  const progress = object(value);
  if (!progress || typeof progress.quizCompleted !== 'boolean' ||
      !(progress.quizScore === null || (typeof progress.quizScore === 'number' && Number.isInteger(progress.quizScore))) ||
      typeof progress.writingCompleted !== 'boolean' ||
      !(progress.completedAt === null || typeof progress.completedAt === 'string')) return null;
  return {
    quizCompleted: progress.quizCompleted,
    quizScore: progress.quizScore as number | null,
    writingCompleted: progress.writingCompleted,
    completedAt: progress.completedAt as string | null,
  };
}

export function parseVocabularyQuizResult(value: unknown): VocabularyQuizResult | null {
  const result = object(value);
  const progress = parseProgress(result?.progress);
  if (!result || typeof result.score !== 'number' || !Number.isInteger(result.score) ||
      typeof result.total !== 'number' || !Number.isInteger(result.total) || !progress) return null;
  return { score: result.score, total: result.total, progress };
}

export function parseVocabularyEvaluationResult(value: unknown): VocabularyEvaluationResult | null {
  const result = object(value);
  const progress = parseProgress(result?.progress);
  if (!result || typeof result.status !== 'string' || typeof result.explanation !== 'string' || !progress) return null;
  return {
    status: result.status,
    correctedSentence: typeof result.correctedSentence === 'string' ? result.correctedSentence : null,
    explanation: result.explanation,
    alternative: typeof result.alternative === 'string' ? result.alternative : null,
    progress,
  };
}

async function postVocabularyAction<T>(path: string, operation: 'quiz' | 'evaluate', body: unknown, parse: (value: unknown) => T | null): Promise<T> {
  let response: Response;
  try {
    response = await authenticatedFetch(path, {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
  } catch {
    throw new VocabularyActionError(operation, null);
  }
  if (!response.ok) throw new VocabularyActionError(operation, response.status);
  let value: unknown;
  try { value = await response.json(); } catch { throw new VocabularyActionError(operation, response.status); }
  const parsed = parse(value);
  if (!parsed) throw new VocabularyActionError(operation, response.status);
  return parsed;
}

export function submitVocabularyQuiz(lessonId: string, answers: VocabularyQuizAnswer[]): Promise<VocabularyQuizResult> {
  return postVocabularyAction('/api/v1/vocabulary/quiz', 'quiz', { lessonId, answers }, parseVocabularyQuizResult);
}

export function evaluateVocabularySentence(lessonId: string, wordId: string, sentence: string): Promise<VocabularyEvaluationResult> {
  return postVocabularyAction('/api/v1/vocabulary/evaluate', 'evaluate', { lessonId, sentence, wordId }, parseVocabularyEvaluationResult);
}

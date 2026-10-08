import { authenticatedFetch } from '../../api/authenticated-fetch';
import type {
  ConversationDifficultyProgress,
  ConversationProgress,
  DailyGoal,
  ProgressComparison,
  ProgressDashboard,
  ProgressData,
  ProgressDifficulty,
  ProgressMetricComparison,
  ProgressOverview,
  ProgressPeriod,
  ProgressTimeline,
  ProgressTimelineMetric,
  ProgressTimelinePoint,
  ReadingDifficultyProgress,
  ReadingProgress,
  VocabularyProgress,
  WeeklyGoals,
} from './progress.types';

export class ProgressLoadError extends Error {
  constructor() {
    super('progress-load-failed');
    this.name = 'ProgressLoadError';
  }
}

const PERIODS: ProgressPeriod[] = ['ALL_TIME', 'LAST_7_DAYS', 'CURRENT_MONTH', 'LAST_30_DAYS'];
const DIFFICULTIES: ProgressDifficulty[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];

function traceProgress(event: string, details: Record<string, string | number | boolean>): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) console.info(`[PROGRESS] ${event}`, details);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isNumber(value);
}

function isDifficulty(value: unknown): value is ProgressDifficulty {
  return typeof value === 'string' && DIFFICULTIES.includes(value as ProgressDifficulty);
}

function isPeriod(value: unknown): value is ProgressPeriod {
  return typeof value === 'string' && PERIODS.includes(value as ProgressPeriod);
}

function isProgressOverview(value: unknown): value is ProgressOverview {
  if (!isRecord(value)) return false;
  return isInteger(value.conversationsCompleted) && isInteger(value.readingsCompleted) &&
    isInteger(value.wordsFirstSeen) && isInteger(value.wordsMasteredCurrent);
}

function isDailyGoalItem(value: unknown): value is { completed: boolean } {
  return isRecord(value) && typeof value.completed === 'boolean';
}

export function isDailyGoal(value: unknown): value is DailyGoal {
  if (!isRecord(value)) return false;
  return typeof value.date === 'string' && isInteger(value.completed) && isInteger(value.total) &&
    isDailyGoalItem(value.vocabulary) && isDailyGoalItem(value.conversation) &&
    isDailyGoalItem(value.reading) && typeof value.goalCompleted === 'boolean';
}

function isWeeklyGoals(value: unknown): value is WeeklyGoals {
  if (!isRecord(value) || !Array.isArray(value.days)) return false;
  return typeof value.weekStart === 'string' && typeof value.weekEnd === 'string' &&
    isInteger(value.completedDays) && value.totalDays === 7 && value.days.length === 7 &&
    value.days.every(isDailyGoal);
}

function isConversationDifficulty(value: unknown): value is ConversationDifficultyProgress {
  if (!isRecord(value)) return false;
  return isDifficulty(value.difficulty) && isInteger(value.count) && isInteger(value.successCount) &&
    isNullableNumber(value.averageOverall) && isNullableNumber(value.averageCommunication) &&
    isNullableNumber(value.averageGrammar) && isNullableNumber(value.averageVocabulary) &&
    isNullableNumber(value.averageFluency) && isNullableNumber(value.averageRelevance);
}

function isConversationProgress(value: unknown): value is ConversationProgress {
  if (!isRecord(value) || !Array.isArray(value.byDifficulty)) return false;
  return isInteger(value.totalEvaluated) && isInteger(value.successCount) &&
    isInteger(value.needsPracticeCount) && isNullableNumber(value.successRate) &&
    isNullableNumber(value.averageOverall) && isNullableNumber(value.averageCommunication) &&
    isNullableNumber(value.averageGrammar) && isNullableNumber(value.averageVocabulary) &&
    isNullableNumber(value.averageFluency) && isNullableNumber(value.averageRelevance) &&
    value.byDifficulty.every(isConversationDifficulty);
}

function isReadingDifficulty(value: unknown): value is ReadingDifficultyProgress {
  if (!isRecord(value)) return false;
  return isDifficulty(value.difficulty) && isInteger(value.count) && isInteger(value.successCount) &&
    isNullableNumber(value.averageComprehension);
}

function isReadingProgress(value: unknown): value is ReadingProgress {
  if (!isRecord(value) || !Array.isArray(value.byDifficulty)) return false;
  return isInteger(value.totalCompleted) && isInteger(value.successCount) &&
    isInteger(value.needsPracticeCount) && isNullableNumber(value.successRate) &&
    isNullableNumber(value.averageComprehension) && value.byDifficulty.every(isReadingDifficulty);
}

function isVocabularyProgress(value: unknown): value is VocabularyProgress {
  if (!isRecord(value)) return false;
  return isInteger(value.totalWords) && isInteger(value.newCount) && isInteger(value.reviewingCount) &&
    isInteger(value.learnedCount) && isInteger(value.masteredCount) && isInteger(value.dueForReview) &&
    isInteger(value.wordsFirstSeenInPeriod) && isInteger(value.wordsReviewedInPeriod);
}

function isComparisonMetric(value: unknown): value is ProgressMetricComparison {
  return isRecord(value) && isNullableNumber(value.current) && isNullableNumber(value.previous) &&
    isNullableNumber(value.delta);
}

function isComparison(value: unknown): value is ProgressComparison | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  return isComparisonMetric(value.conversationAverageOverall) &&
    isComparisonMetric(value.readingAverageComprehension) &&
    isComparisonMetric(value.conversationCount) && isComparisonMetric(value.readingCount) &&
    isComparisonMetric(value.newWordsCount);
}

function isTimelineMetric(value: unknown): value is ProgressTimelineMetric {
  return isRecord(value) && isInteger(value.count) && isNullableNumber(value.average);
}

function isTimelinePoint(value: unknown): value is ProgressTimelinePoint {
  return isRecord(value) && typeof value.period === 'string' && isTimelineMetric(value.conversation) &&
    isTimelineMetric(value.reading) && isRecord(value.vocabulary) &&
    isInteger(value.vocabulary.wordsFirstSeen);
}

export function parseProgressData(value: unknown): ProgressData | null {
  if (!isRecord(value) || !isProgressOverview(value.overview) || !isDailyGoal(value.dailyGoal)) return null;
  return { overview: value.overview, dailyGoal: value.dailyGoal };
}

export function parseProgressDashboard(value: unknown): ProgressDashboard | null {
  if (!isRecord(value) || !isPeriod(value.period) ||
      !(value.periodStart === null || typeof value.periodStart === 'string') ||
      typeof value.periodEnd !== 'string' || !isProgressOverview(value.overview) ||
      !isConversationProgress(value.conversation) || !isReadingProgress(value.reading) ||
      !isVocabularyProgress(value.vocabulary) || !isComparison(value.comparison) ||
      !isDailyGoal(value.dailyGoal) || !isWeeklyGoals(value.weeklyGoals)) return null;
  return {
    period: value.period,
    periodStart: value.periodStart,
    periodEnd: value.periodEnd,
    overview: value.overview,
    conversation: value.conversation,
    reading: value.reading,
    vocabulary: value.vocabulary,
    comparison: value.comparison,
    dailyGoal: value.dailyGoal,
    weeklyGoals: value.weeklyGoals,
  };
}

export function parseProgressTimeline(value: unknown): ProgressTimeline | null {
  if (!isRecord(value) || !Array.isArray(value.points) || !value.points.every(isTimelinePoint)) return null;
  return { points: value.points };
}

async function progressJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await authenticatedFetch(path, { signal });
  traceProgress('response', { path, status: response.status, ok: response.ok });
  if (!response.ok) throw new ProgressLoadError();
  try {
    return await response.json();
  } catch {
    traceProgress('json-error', { path, status: response.status });
    throw new ProgressLoadError();
  }
}

export async function getProgressOverview(signal?: AbortSignal): Promise<ProgressData> {
  const body = await progressJson('/api/v1/progress?period=ALL_TIME', signal);
  const parsed = parseProgressData(body);
  if (!parsed) throw new ProgressLoadError();
  return parsed;
}

export async function getProgressDashboard(period: ProgressPeriod, signal?: AbortSignal): Promise<ProgressDashboard> {
  const body = await progressJson(`/api/v1/progress?period=${encodeURIComponent(period)}`, signal);
  const parsed = parseProgressDashboard(body);
  if (!parsed) throw new ProgressLoadError();
  return parsed;
}

export async function getProgressTimeline(signal?: AbortSignal): Promise<ProgressTimeline> {
  const body = await progressJson('/api/v1/progress/timeline', signal);
  const parsed = parseProgressTimeline(body);
  if (!parsed) throw new ProgressLoadError();
  return parsed;
}

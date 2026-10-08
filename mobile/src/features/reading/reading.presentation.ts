import type { EnglishLevel } from '../profile/profile.types';
import type { ReadingActivityStatus, ReadingActivitySummary, ReadingDifficulty, ReadingHint, ReadingQuestionType, ReadingTopic } from './reading.types';

export const READING_DIFFICULTIES: ReadingDifficulty[] = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
export const READING_TOPICS: ReadingTopic[] = ['DAILY_LIFE', 'TRAVEL', 'WORK', 'TECHNOLOGY', 'CULTURE', 'RANDOM'];

const DIFFICULTY_LABELS: Record<ReadingDifficulty, string> = {
  BEGINNER: 'Iniciante',
  INTERMEDIATE: 'Intermediário',
  ADVANCED: 'Avançado',
};

const DIFFICULTY_CEFR: Record<ReadingDifficulty, string> = {
  BEGINNER: 'A1–A2',
  INTERMEDIATE: 'B1–B2',
  ADVANCED: 'C1–C2',
};

const TOPIC_LABELS: Record<ReadingTopic, string> = {
  DAILY_LIFE: 'Cotidiano',
  TRAVEL: 'Viagem',
  WORK: 'Trabalho',
  TECHNOLOGY: 'Tecnologia',
  CULTURE: 'Cultura',
  RANDOM: 'Aleatório',
};

export function getReadingDifficultyLabel(value: ReadingDifficulty): string {
  return DIFFICULTY_LABELS[value];
}

export function getReadingDifficultyCefr(value: ReadingDifficulty): string {
  return DIFFICULTY_CEFR[value];
}

export function getReadingTopicLabel(value: ReadingTopic): string {
  return TOPIC_LABELS[value];
}

function normalizeReadingSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');
}

export function filterReadingActivities(activities: ReadingActivitySummary[], query: string): ReadingActivitySummary[] {
  const search = normalizeReadingSearch(query);
  if (!search) return activities;
  return activities.filter((activity) => normalizeReadingSearch(`${activity.title} ${getReadingTopicLabel(activity.topic)}`).includes(search));
}

export function estimateReadingMinutes(text: string): number {
  const words = text.trim().match(/\S+/gu)?.length ?? 0;
  return Math.max(1, Math.ceil(words / 120));
}

export type ReadingTextSegment = { text: string; highlighted: boolean; hintIndex: number | null };
type TermRange = { start: number; end: number; hintIndex: number };

function termRanges(text: string, expressions: string[]): TermRange[] {
  const ranges: TermRange[] = [];
  for (const [hintIndex, expression] of expressions.entries()) {
    const words = expression.trim().split(/\s+/u);
    if (!words[0]) continue;
    const pattern = words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    const matcher = new RegExp(pattern, 'giu');
    for (const match of text.matchAll(matcher)) {
      const start = match.index;
      const end = start + match[0].length;
      if ((start > 0 && /[\p{L}\p{N}]/u.test(text[start - 1])) ||
          (end < text.length && /[\p{L}\p{N}]/u.test(text[end]))) continue;
      ranges.push({ start, end, hintIndex });
    }
  }
  return ranges.sort((a, b) => a.start - b.start || b.end - a.end);
}

export function getHighlightedReadingSegments(text: string, expressions: string[]): ReadingTextSegment[] {
  if (expressions.length === 0) return [{ text, highlighted: false, hintIndex: null }];
  const segments: ReadingTextSegment[] = [];
  let cursor = 0;
  for (const range of termRanges(text, expressions)) {
    if (range.start < cursor) continue;
    if (range.start > cursor) segments.push({ text: text.slice(cursor, range.start), highlighted: false, hintIndex: null });
    segments.push({ text: text.slice(range.start, range.end), highlighted: true, hintIndex: range.hintIndex });
    cursor = range.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), highlighted: false, hintIndex: null });
  return segments.length ? segments : [{ text, highlighted: false, hintIndex: null }];
}

export function getReadingHintContext(text: string, expression: string): string | null {
  const first = termRanges(text, [expression])[0];
  if (!first) return null;
  const previous = text.slice(0, first.start).search(/[^.!?\n]*$/u);
  const start = previous < 0 ? 0 : previous;
  const rest = text.slice(first.end);
  const sentenceEnd = rest.search(/[.!?\n]/u);
  return text.slice(start, sentenceEnd < 0 ? text.length : first.end + sentenceEnd + 1).trim();
}

const HINT_TYPE_LABELS: Record<ReadingHint['type'], string> = {
  VOCABULARY: 'Vocabulário',
  PHRASAL_VERB: 'Phrasal verb',
  EXPRESSION: 'Expressão',
  IDIOM: 'Expressão idiomática',
  GRAMMAR: 'Gramática',
  PRONUNCIATION: 'Pronúncia',
};

export function getReadingHintTypeLabel(value: ReadingHint['type']): string {
  return HINT_TYPE_LABELS[value];
}

export function getReadingStatusLabel(value: ReadingActivityStatus): string {
  return value === 'IN_PROGRESS' ? 'Em andamento' : value === 'SUCCESS' ? 'Concluída' : 'Precisa de prática';
}

export function isReadingClosedWithoutResult(activity: Pick<ReadingActivitySummary, 'status' | 'correctAnswers' | 'comprehensionPercentage'>): boolean {
  return activity.status === 'NEEDS_PRACTICE' &&
    activity.correctAnswers === null && activity.comprehensionPercentage === null;
}

export function getReadingQuestionTypeLabel(value: ReadingQuestionType): string {
  if (value === 'MAIN_IDEA') return 'Ideia principal';
  if (value === 'DETAIL') return 'Detalhes';
  return 'Vocabulário';
}

export function getReadingResultMessage(value: ReadingActivityStatus): string {
  return value === 'SUCCESS' ? 'Muito bem! Você compreendeu o texto.' : 'Continue praticando para fortalecer sua compreensão.';
}

export function difficultyForEnglishLevel(level: EnglishLevel | null | undefined): ReadingDifficulty {
  if (level === 'A1' || level === 'A2') return 'BEGINNER';
  if (level === 'C1' || level === 'C2') return 'ADVANCED';
  return 'INTERMEDIATE';
}

export function formatReadingDate(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
}

export function isReadingCompleted(status: ReadingActivityStatus): boolean {
  return status !== 'IN_PROGRESS';
}

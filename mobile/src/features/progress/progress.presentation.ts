import type {
  ProgressDifficulty,
  ProgressPeriod,
  ProgressTimelinePoint,
  VocabularyProgress,
} from './progress.types';

export const PROGRESS_PERIOD_OPTIONS: { value: ProgressPeriod; label: string }[] = [
  { value: 'ALL_TIME', label: 'Geral' },
  { value: 'LAST_7_DAYS', label: '7 dias' },
  { value: 'CURRENT_MONTH', label: 'Este mês' },
  { value: 'LAST_30_DAYS', label: '30 dias' },
];

const DIFFICULTY_LABELS: Record<ProgressDifficulty, string> = {
  BEGINNER: 'Iniciante',
  INTERMEDIATE: 'Intermediário',
  ADVANCED: 'Avançado',
};

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
export const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export function getProgressDifficultyLabel(difficulty: ProgressDifficulty): string {
  return DIFFICULTY_LABELS[difficulty];
}

export function formatProgressScore(value: number | null): string {
  return value === null ? 'Sem dados' : `${Math.round(value)}%`;
}

export function getProgressMonthLabel(period: string): string {
  const month = Number(period.slice(5, 7));
  return month >= 1 && month <= 12 ? MONTH_LABELS[month - 1] : period;
}

export function hasActivityEvolution(points: ProgressTimelinePoint[]): boolean {
  return points.some((point) => point.conversation.count > 0 || point.reading.count > 0 || point.vocabulary.wordsFirstSeen > 0);
}

export function hasPerformanceEvolution(points: ProgressTimelinePoint[]): boolean {
  const conversationPoints = points.filter((point) => point.conversation.average !== null).length;
  const readingPoints = points.filter((point) => point.reading.average !== null).length;
  return conversationPoints >= 2 || readingPoints >= 2;
}

export function getVocabularyDistribution(vocabulary: VocabularyProgress) {
  return [
    { key: 'new', label: 'Novas', value: vocabulary.newCount, color: '#6b5cff' },
    { key: 'reviewing', label: 'Em revisão', value: vocabulary.reviewingCount, color: '#35a7d7' },
    { key: 'learned', label: 'Aprendidas', value: vocabulary.learnedCount, color: '#f0a43c' },
    { key: 'mastered', label: 'Dominadas', value: vocabulary.masteredCount, color: '#2da66f' },
  ] as const;
}

export function progressRatio(value: number, maximum: number): number {
  if (maximum <= 0) return 0;
  return Math.min(1, Math.max(0, value / maximum));
}

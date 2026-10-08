export type ProgressPeriod = 'ALL_TIME' | 'LAST_7_DAYS' | 'CURRENT_MONTH' | 'LAST_30_DAYS';
export type ProgressDifficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export type ProgressOverview = {
  conversationsCompleted: number;
  readingsCompleted: number;
  wordsFirstSeen: number;
  wordsMasteredCurrent: number;
};

export type DailyGoalItem = { completed: boolean };

export type DailyGoal = {
  date: string;
  completed: number;
  total: number;
  vocabulary: DailyGoalItem;
  conversation: DailyGoalItem;
  reading: DailyGoalItem;
  goalCompleted: boolean;
};

export type WeeklyGoals = {
  weekStart: string;
  weekEnd: string;
  completedDays: number;
  totalDays: number;
  days: DailyGoal[];
};

export type ConversationDifficultyProgress = {
  difficulty: ProgressDifficulty;
  count: number;
  successCount: number;
  averageOverall: number | null;
  averageCommunication: number | null;
  averageGrammar: number | null;
  averageVocabulary: number | null;
  averageFluency: number | null;
  averageRelevance: number | null;
};

export type ConversationProgress = {
  totalEvaluated: number;
  successCount: number;
  needsPracticeCount: number;
  successRate: number | null;
  averageOverall: number | null;
  averageCommunication: number | null;
  averageGrammar: number | null;
  averageVocabulary: number | null;
  averageFluency: number | null;
  averageRelevance: number | null;
  byDifficulty: ConversationDifficultyProgress[];
};

export type ReadingDifficultyProgress = {
  difficulty: ProgressDifficulty;
  count: number;
  successCount: number;
  averageComprehension: number | null;
};

export type ReadingProgress = {
  totalCompleted: number;
  successCount: number;
  needsPracticeCount: number;
  successRate: number | null;
  averageComprehension: number | null;
  byDifficulty: ReadingDifficultyProgress[];
};

export type VocabularyProgress = {
  totalWords: number;
  newCount: number;
  reviewingCount: number;
  learnedCount: number;
  masteredCount: number;
  dueForReview: number;
  wordsFirstSeenInPeriod: number;
  wordsReviewedInPeriod: number;
};

export type ProgressMetricComparison = {
  current: number | null;
  previous: number | null;
  delta: number | null;
};

export type ProgressComparison = {
  conversationAverageOverall: ProgressMetricComparison;
  readingAverageComprehension: ProgressMetricComparison;
  conversationCount: ProgressMetricComparison;
  readingCount: ProgressMetricComparison;
  newWordsCount: ProgressMetricComparison;
};

export type ProgressData = {
  overview: ProgressOverview;
  dailyGoal: DailyGoal;
};

export type ProgressDashboard = ProgressData & {
  period: ProgressPeriod;
  periodStart: string | null;
  periodEnd: string;
  conversation: ConversationProgress;
  reading: ReadingProgress;
  vocabulary: VocabularyProgress;
  comparison: ProgressComparison | null;
  weeklyGoals: WeeklyGoals;
};

export type ProgressTimelineMetric = {
  count: number;
  average: number | null;
};

export type ProgressTimelinePoint = {
  period: string;
  conversation: ProgressTimelineMetric;
  reading: ProgressTimelineMetric;
  vocabulary: { wordsFirstSeen: number };
};

export type ProgressTimeline = { points: ProgressTimelinePoint[] };

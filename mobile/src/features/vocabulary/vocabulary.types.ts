import type { EnglishLevel } from '../profile/profile.types';

export type VocabularyProgressStatus = 'NEW' | 'REVIEWING' | 'LEARNED' | 'MASTERED';

export type DailyVocabularyWord = {
  id: string;
  word: string;
  translation: string;
  example: string | null;
  exampleTranslation: string | null;
  category: string | null;
  status: VocabularyProgressStatus;
  review: boolean;
};

export type VocabularyLessonProgress = {
  quizCompleted: boolean;
  quizScore: number | null;
  writingCompleted: boolean;
  completedAt: string | null;
};

export type DailyVocabularyLesson = {
  id: string;
  date: string;
  englishLevel: EnglishLevel;
  category: string;
  words: DailyVocabularyWord[];
  progress: VocabularyLessonProgress;
};

export type VocabularyQuizAnswer = {
  wordId: string;
  selectedWordId: string;
};

export type VocabularyQuizResult = {
  score: number;
  total: number;
  progress: VocabularyLessonProgress;
};

export type VocabularyEvaluationResult = {
  status: string;
  correctedSentence: string | null;
  explanation: string;
  alternative: string | null;
  progress: VocabularyLessonProgress;
};

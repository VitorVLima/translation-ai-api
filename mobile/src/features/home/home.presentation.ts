import type { DailyGoal } from '../progress/progress.types';
import type { DailyVocabularyLesson } from '../vocabulary/vocabulary.types';
import { translate } from '../../i18n/translate';

const HOME_CONTENT_MAX_WIDTH = 430;
const HOME_SCREEN_HORIZONTAL_PADDING = 20;
const VOCABULARY_CARD_HORIZONTAL_PADDING = 11;
const VOCABULARY_CARD_GAP = 8;
const VOCABULARY_VISIBLE_CARD_TARGET = 2.7;
const VOCABULARY_MIN_CARD_WIDTH = 96;

export function getHomeVocabularyCardWidth(viewportWidth: number): number {
  const homeContentWidth = Math.min(
    Math.max(0, viewportWidth - HOME_SCREEN_HORIZONTAL_PADDING * 2),
    HOME_CONTENT_MAX_WIDTH,
  );
  const carouselWidth = Math.max(0, homeContentWidth - VOCABULARY_CARD_HORIZONTAL_PADDING * 2);
  return Math.max(
    VOCABULARY_MIN_CARD_WIDTH,
    Math.floor((carouselWidth - VOCABULARY_CARD_GAP * 2) / VOCABULARY_VISIBLE_CARD_TARGET),
  );
}

export function getDailyGoalMessage(goal: DailyGoal): string {
  const completed = [goal.vocabulary.completed, goal.conversation.completed, goal.reading.completed]
    .filter(Boolean).length;

  if (completed === 0) return translate('home.dailyGoal.startToday');
  if (completed === 3) return translate('home.dailyGoal.allDone');
  if (completed === 2) {
    if (!goal.conversation.completed) return translate('home.dailyGoal.oneLeft.conversation');
    if (!goal.reading.completed) return translate('home.dailyGoal.oneLeft.reading');
    if (!goal.vocabulary.completed) return translate('home.dailyGoal.oneLeft.vocabulary');
  }
  return translate('home.dailyGoal.count', { count: completed });
}

export type HomeVocabularyState = 'not-started' | 'in-progress' | 'completed';

export function getHomeVocabularyState(lesson: DailyVocabularyLesson): HomeVocabularyState {
  if (lesson.progress.completedAt) return 'completed';
  if (lesson.progress.quizCompleted || lesson.progress.writingCompleted) return 'in-progress';
  return 'not-started';
}

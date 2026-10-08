export type ReadingDifficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export type ReadingTopic = 'DAILY_LIFE' | 'TRAVEL' | 'WORK' | 'TECHNOLOGY' | 'CULTURE' | 'RANDOM';

export type ReadingActivityStatus = 'IN_PROGRESS' | 'SUCCESS' | 'NEEDS_PRACTICE';

export type ReadingQuestionType = 'MAIN_IDEA' | 'DETAIL' | 'VOCABULARY';

export type ReadingActivitySummary = {
  activityId: string;
  title: string;
  difficulty: ReadingDifficulty;
  topic: ReadingTopic;
  status: ReadingActivityStatus;
  questionCount: number;
  correctAnswers: number | null;
  comprehensionPercentage: number | null;
  createdAt: string;
  completedAt: string | null;
};

export type ReadingQuestion = {
  id: string;
  type: ReadingQuestionType;
  question: string;
  options: string[];
  correctOption: number | null;
  explanation: string | null;
};

export type ReadingAnswer = {
  questionId: string;
  selectedOption: number;
};

export type ReadingSubmissionResult = {
  activityId: string;
  correctAnswers: number;
  totalQuestions: number;
  percentage: number;
  status: ReadingActivityStatus;
  difficulty: ReadingDifficulty;
};

export type ReadingActivityDetail = ReadingActivitySummary & {
  text: string;
  questions: ReadingQuestion[];
  hints: ReadingHint[] | null;
};

export type ReadingGenerateResponse = {
  activityId: string;
  title: string;
  text: string;
  difficulty: ReadingDifficulty;
  topic: ReadingTopic;
};

export type ReadingHint = {
  expression: string;
  explanation: string;
  type: 'VOCABULARY' | 'PHRASAL_VERB' | 'EXPRESSION' | 'IDIOM' | 'GRAMMAR' | 'PRONUNCIATION';
};

export type ReadingTranslation = {
  translation: string;
};

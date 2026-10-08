export type ConversationDifficulty = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export type ConversationLanguage = 'en' | 'pt';

export type ConversationMode = 'TEXT' | 'VOICE';

export type ConversationMessageRole = 'USER' | 'ASSISTANT';

export type ConversationScenario = {
  id: string;
  displayName: string;
  description: string;
  assistantDisplayName: string;
  assistantAvatarKey: string;
  assistantAvatarImageUrl: string;
};

export type CreateConversationRequest = {
  scenario: string;
  language: ConversationLanguage;
  difficulty?: ConversationDifficulty;
  interactionMode: ConversationMode;
};

export type ConversationSummary = {
  id: string;
  scenario: string;
  language: ConversationLanguage;
  difficulty: ConversationDifficulty;
  interactionMode: ConversationMode;
  title: string;
  scenarioDisplayName: string;
  description: string;
  assistantDisplayName: string;
  assistantAvatarKey: string;
  assistantAvatarImageUrl: string;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
};

export type ConversationMessage = {
  id: string;
  role: ConversationMessageRole;
  content: string;
  correctedText: string | null;
  createdAt: string;
};

export type ConversationEvaluationScores = {
  communication: number;
  grammar: number;
  vocabulary: number;
  fluency: number;
  relevance: number | null;
  overall: number;
};

export type ConversationEvaluation = {
  conversationId: string;
  status: 'INSUFFICIENT' | 'SUCCESS' | 'NEEDS_PRACTICE';
  scores?: ConversationEvaluationScores;
  strengths?: string[];
  improvements?: string[];
  evaluatedAt?: string;
  minimumUserMessages?: number;
  currentUserMessages?: number;
};

export type ConversationDetail = {
  conversation: ConversationSummary;
  messages: ConversationMessage[];
  evaluation: ConversationEvaluation | null;
};

export type SendConversationMessageRequest = {
  message: string;
};

export type SendConversationMessageResponse = {
  reply: string;
  hasCorrection: boolean;
  correctedText: string | null;
};

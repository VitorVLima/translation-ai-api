import type { EnglishLevel } from '../profile/profile.types';
import type {
  ConversationDifficulty,
  ConversationEvaluation,
  ConversationEvaluationScores,
  ConversationMessage,
  ConversationMode,
  ConversationScenario,
  ConversationSummary,
  CreateConversationRequest,
} from './conversations.types';

const DIFFICULTY_LABELS: Record<ConversationDifficulty, string> = {
  BEGINNER: 'Iniciante',
  INTERMEDIATE: 'Intermediário',
  ADVANCED: 'Avançado',
};

export function getConversationDifficultyLabel(difficulty: ConversationDifficulty): string {
  return DIFFICULTY_LABELS[difficulty];
}

export type ConversationDifficultyOption = {
  value: ConversationDifficulty;
  label: string;
  cefr: string;
  description: string;
};

export type ConversationModeOption = {
  value: ConversationMode;
  label: string;
  title: string;
  description: string;
  available: boolean;
};

export const DEFAULT_CONVERSATION_MODE: ConversationMode = 'TEXT';
export const MAX_CONVERSATION_MESSAGE_LENGTH = 5000;
// Mirrors the current public evaluation contract. The server remains authoritative
// and returns its own counters when a completion attempt is insufficient.
export const MINIMUM_EVALUATION_USER_MESSAGES = 5;
// Visual score cue only; the Backend decides the evaluation result independently.
export const EVALUATION_POSITIVE_SCORE_THRESHOLD = 70;

export function getEvaluationScoreTone(score: number): 'positive' | 'negative' {
  return score >= EVALUATION_POSITIVE_SCORE_THRESHOLD ? 'positive' : 'negative';
}

export const CONVERSATION_DIFFICULTY_OPTIONS: readonly ConversationDifficultyOption[] = [
  {
    value: 'BEGINNER',
    label: 'Iniciante',
    cefr: 'A1–A2',
    description: 'Frases mais simples, vocabulário comum e mais apoio.',
  },
  {
    value: 'INTERMEDIATE',
    label: 'Intermediário',
    cefr: 'B1–B2',
    description: 'Conversas naturais, vocabulário variado e desafio moderado.',
  },
  {
    value: 'ADVANCED',
    label: 'Avançado',
    cefr: 'C1–C2',
    description: 'Inglês mais natural, com estruturas e vocabulário avançados.',
  },
] as const;

export const CONVERSATION_MODE_OPTIONS: readonly ConversationModeOption[] = [
  {
    value: 'TEXT',
    label: 'Texto',
    title: 'Digite suas mensagens',
    description: 'Ideal para praticar no seu ritmo.',
    available: true,
  },
  {
    value: 'VOICE',
    label: 'Voz',
    title: 'Fale em inglês com a IA',
    description: 'Pratique pronúncia e fluência.',
    available: true,
  },
] as const;

const LEVEL_DIFFICULTY: Record<EnglishLevel, ConversationDifficulty> = {
  A1: 'BEGINNER',
  A2: 'BEGINNER',
  B1: 'INTERMEDIATE',
  B2: 'INTERMEDIATE',
  C1: 'ADVANCED',
  C2: 'ADVANCED',
};

export function recommendedConversationDifficulty(
  englishLevel: EnglishLevel | null | undefined,
): ConversationDifficulty {
  return englishLevel ? LEVEL_DIFFICULTY[englishLevel] : 'INTERMEDIATE';
}

export function buildCreateConversationRequest(
  scenario: string,
  difficulty: ConversationDifficulty,
  interactionMode: ConversationMode = DEFAULT_CONVERSATION_MODE,
): CreateConversationRequest {
  if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(scenario)) throw new Error('invalid-scenario');
  if (!CONVERSATION_DIFFICULTY_OPTIONS.some((option) => option.value === difficulty)) {
    throw new Error('invalid-difficulty');
  }
  if (!CONVERSATION_MODE_OPTIONS.some((option) => option.value === interactionMode)) throw new Error('invalid-mode');
  return { scenario, language: 'en', difficulty, interactionMode };
}

export function normalizeConversationMessage(value: string): string | null {
  const message = value.trim();
  if (!message) return null;
  if (message.length > MAX_CONVERSATION_MESSAGE_LENGTH) throw new Error('message-too-long');
  return message;
}

export function appendDictationToDraft(draft: string, transcription: string): string {
  const spoken = normalizeConversationMessage(transcription);
  if (!spoken) throw new Error('empty-transcription');
  const combined = draft.trim() ? `${draft.trimEnd()} ${spoken}` : spoken;
  if (combined.length > MAX_CONVERSATION_MESSAGE_LENGTH) throw new Error('message-too-long');
  return combined;
}

export function isConversationId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function getNewAssistantMessage(
  previousMessageIds: Set<string>,
  messages: ConversationMessage[],
): ConversationMessage | null {
  const newAssistantMessages = messages.filter((message) => (
    message.role === 'ASSISTANT' && !previousMessageIds.has(message.id)
  ));
  return newAssistantMessages.at(-1) ?? null;
}

export function visibleConversationMessages(
  persisted: ConversationMessage[],
  optimistic: ConversationMessage | null,
  knownMessageIds: ReadonlySet<string> | null,
): ConversationMessage[] {
  if (!optimistic || !knownMessageIds) return persisted;
  const confirmed = persisted.some((message) => message.role === 'USER' &&
    message.content === optimistic.content && !knownMessageIds.has(message.id));
  return confirmed ? persisted : [...persisted, optimistic];
}

// The Backend stores the turn's correctedText on the ASSISTANT reply. Present
// that suggestion beside the preceding USER message without changing the DTO.
export function getUserCorrection(messages: ConversationMessage[], index: number): string | null {
  const message = messages[index];
  const reply = messages[index + 1];
  if (message?.role !== 'USER' || reply?.role !== 'ASSISTANT') return null;
  const correction = reply.correctedText?.trim();
  return correction && correction !== message.content.trim() ? correction : null;
}

export function canSendConversationMessage(endedAt: string | null): boolean {
  return endedAt === null;
}

export type ConversationEvaluationProgress = {
  current: number;
  displayCurrent: number;
  required: number;
  ready: boolean;
};

export function isLinguisticUserMessage(message: ConversationMessage): boolean {
  return message.role === 'USER' && /\p{L}/u.test(message.content);
}

export function getConversationEvaluationProgress(
  messages: ConversationMessage[],
  required = MINIMUM_EVALUATION_USER_MESSAGES,
): ConversationEvaluationProgress {
  const current = messages.filter(isLinguisticUserMessage).length;
  return {
    current,
    displayCurrent: Math.min(current, required),
    required,
    ready: current >= required,
  };
}

export function getInsufficientEvaluationMessage(evaluation: ConversationEvaluation): string {
  void evaluation;
  return 'Continue conversando um pouco mais para liberar uma avaliação completa.';
}

export function getEvaluationProgressCopy(ready: boolean): { detail: string; accessibilityLabel: string } {
  return ready
    ? { detail: 'Pronto para avaliação.', accessibilityLabel: 'Progresso para avaliação. Pronto para avaliação.' }
    : { detail: 'Continue conversando para liberar sua avaliação.', accessibilityLabel: 'Progresso para avaliação. Continue conversando.' };
}

export type EvaluationScorePresentation = { key: keyof ConversationEvaluationScores; label: string; value: number | null };

const EVALUATION_SCORE_LABELS: { key: keyof ConversationEvaluationScores; label: string }[] = [
  { key: 'communication', label: 'Comunicação' },
  { key: 'grammar', label: 'Gramática' },
  { key: 'vocabulary', label: 'Vocabulário' },
  { key: 'fluency', label: 'Fluência' },
  { key: 'relevance', label: 'Relevância' },
];

export function getEvaluationScorePresentation(
  scores: ConversationEvaluationScores | undefined,
): EvaluationScorePresentation[] {
  if (!scores) return [];
  return EVALUATION_SCORE_LABELS.map(({ key, label }) => ({ key, label, value: scores[key] }));
}

export function getEvaluationStatusPresentation(status: ConversationEvaluation['status']): {
  title: string;
  description: string;
} {
  if (status === 'SUCCESS') {
    return { title: 'Boa comunicação!', description: 'Sua conversa foi avaliada. Continue praticando para evoluir ainda mais.' };
  }
  if (status === 'NEEDS_PRACTICE') {
    return { title: 'Continue praticando', description: 'Sua conversa mostrou pontos importantes para desenvolver nas próximas práticas.' };
  }
  return { title: 'Ainda não há mensagens suficientes', description: 'Continue conversando para liberar uma avaliação completa.' };
}

export function getConversationCreateErrorMessage(
  status: number | null,
  kind: 'network' | 'http' | 'invalid-response',
): string {
  if (status === 409) {
    return 'Você já possui três conversas em andamento. Conclua ou exclua uma delas antes de iniciar outra.';
  }
  if (status === 400) return 'As escolhas da conversa não são mais válidas. Revise as opções e tente novamente.';
  if (status === 404) return 'Este cenário não está mais disponível. Volte e escolha outro cenário.';
  if (status === 429) return 'Muitas solicitações no momento. Aguarde um pouco antes de tentar novamente.';
  if (status === 503) return 'A IA está temporariamente indisponível. Tente novamente em alguns instantes.';
  if (kind === 'invalid-response') return 'A conversa foi criada, mas não foi possível abri-la. Consulte sua lista de conversas.';
  return 'Não foi possível confirmar a criação. Consulte sua lista de conversas antes de tentar novamente.';
}

export type ConversationScenarioPresentation = ConversationScenario & {
  avatarImageUrl: string | null;
};

export function getConversationScenarioPresentation(
  scenario: ConversationScenario,
  apiUrl: string,
): ConversationScenarioPresentation {
  return {
    ...scenario,
    avatarImageUrl: resolveImageUrl(scenario.assistantAvatarImageUrl, apiUrl),
  };
}

export type HomeConversationPresentation =
  | {
      kind: 'continue';
      conversation: ConversationSummary;
      title: string;
      difficultyLabel: string;
      updatedLabel: string;
      avatarImageUrl: string | null;
    }
  | {
      kind: 'new';
      hasHistory: boolean;
      title: string;
      description: string;
      actionLabel: string;
    };

export type ConversationFilter = 'active' | 'completed';

export type ConversationGroups = {
  active: ConversationSummary[];
  completed: ConversationSummary[];
};

export type ConversationListItemPresentation = {
  id: string;
  title: string;
  description: string;
  difficultyLabel: string;
  interactionModeLabel: 'Texto' | 'Voz';
  assistantDisplayName: string;
  dateLabel: string;
  avatarImageUrl: string | null;
  completed: boolean;
};

function time(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function mostRecentActiveConversation(
  conversations: ConversationSummary[],
): ConversationSummary | null {
  return groupConversations(conversations).active[0] ?? null;
}

function sortByDateDescending(
  conversations: ConversationSummary[],
  dateFor: (conversation: ConversationSummary) => string,
): ConversationSummary[] {
  return conversations
    .map((conversation, index) => ({ conversation, index }))
    .sort((left, right) => {
      const leftTime = time(dateFor(left.conversation));
      const rightTime = time(dateFor(right.conversation));
      if (leftTime === rightTime) return left.index - right.index;
      return rightTime - leftTime;
    })
    .map(({ conversation }) => conversation);
}

export function groupConversations(conversations: ConversationSummary[]): ConversationGroups {
  const active = conversations.filter((conversation) => conversation.endedAt === null);
  const completed = conversations.filter((conversation) => conversation.endedAt !== null);

  return {
    active: sortByDateDescending(active, (conversation) => conversation.updatedAt),
    completed: sortByDateDescending(completed, (conversation) => conversation.endedAt ?? ''),
  };
}

function resolveImageUrl(path: string, apiUrl: string): string | null {
  if (!path) return null;
  try {
    return new URL(path, `${apiUrl}/`).toString();
  } catch {
    return null;
  }
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
  }).format(date);
  return `Atualizada em ${formatted}`;
}

function formatListDate(value: string, prefix: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${prefix} ${new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)}`;
}

export function getConversationListItemPresentation(
  conversation: ConversationSummary,
  apiUrl: string,
): ConversationListItemPresentation {
  const completed = conversation.endedAt !== null;
  return {
    id: conversation.id,
    title: conversation.scenarioDisplayName.trim() || conversation.title.trim() || 'Conversa',
    description: conversation.description.trim(),
    difficultyLabel: DIFFICULTY_LABELS[conversation.difficulty],
    interactionModeLabel: conversation.interactionMode === 'VOICE' ? 'Voz' : 'Texto',
    assistantDisplayName: conversation.assistantDisplayName.trim(),
    dateLabel: completed
      ? formatListDate(conversation.endedAt ?? '', 'Concluída em')
      : formatListDate(conversation.updatedAt, 'Atualizada em'),
    avatarImageUrl: resolveImageUrl(conversation.assistantAvatarImageUrl, apiUrl),
    completed,
  };
}

function normalizeConversationSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}

export function filterConversationListItems(
  items: ConversationListItemPresentation[],
  query: string,
): ConversationListItemPresentation[] {
  const normalizedQuery = normalizeConversationSearch(query);
  if (!normalizedQuery) return items;

  return items.filter((item) => [item.title, item.description, item.assistantDisplayName]
    .some((value) => normalizeConversationSearch(value).includes(normalizedQuery)));
}

export function getHomeConversationPresentation(
  conversations: ConversationSummary[],
  apiUrl: string,
): HomeConversationPresentation {
  const active = mostRecentActiveConversation(conversations);
  if (active) {
    return {
      kind: 'continue',
      conversation: active,
      title: active.scenarioDisplayName.trim() || active.title.trim() || 'Conversa',
      difficultyLabel: DIFFICULTY_LABELS[active.difficulty],
      updatedLabel: formatUpdatedAt(active.updatedAt),
      avatarImageUrl: resolveImageUrl(active.assistantAvatarImageUrl, apiUrl),
    };
  }

  const hasHistory = conversations.length > 0;
  return {
    kind: 'new',
    hasHistory,
    title: hasHistory ? 'Pronto para praticar?' : 'Comece sua primeira conversa',
    description: hasHistory
      ? 'Comece uma nova conversa e continue evoluindo.'
      : 'Pratique situações reais em inglês com a IA.',
    actionLabel: hasHistory ? 'Nova conversa' : 'Criar conversa',
  };
}

import type { DailyVocabularyLesson, DailyVocabularyWord } from './vocabulary.types';
import { translate } from '../../i18n/translate';

const CATEGORY_CODES = [
  'BODY', 'CLOTHES', 'COLORS', 'COMMON_ADJECTIVES', 'COMMON_VERBS', 'COUNTRIES', 'FAMILY', 'FOOD',
  'HEALTH', 'HOUSE', 'LEISURE', 'NATIONALITIES', 'NUMBERS', 'RESTAURANT', 'SCHOOL', 'SHOPPING',
  'TECHNOLOGY', 'TRANSPORT', 'TRAVEL', 'WORK',
] as const;
type VocabularyCategoryCode = typeof CATEGORY_CODES[number];
const CATEGORIES: ReadonlySet<string> = new Set(CATEGORY_CODES);

export function getVocabularyCategoryLabel(category: string | null): string | null {
  if (!category) return null;
  return CATEGORIES.has(category)
    ? translate(`domain.vocabulary.${category as VocabularyCategoryCode}`)
    : category.replaceAll('_', ' ').toLocaleLowerCase('pt-BR');
}

export function getVocabularyStudyProgress(index: number, total: number) {
  const safeTotal = Math.max(1, total);
  const safeIndex = Math.min(Math.max(0, index), safeTotal - 1);
  return { fraction: (safeIndex + 1) / safeTotal, label: `${safeIndex + 1} de ${safeTotal}` };
}

export type VocabularyStudyDensity = 0 | 1 | 2;

export function getVocabularyStudyFit(density: VocabularyStudyDensity, viewportHeight: number, contentHeight: number) {
  const overflows = viewportHeight > 0 && contentHeight > viewportHeight + 1;
  return {
    density: overflows && density < 2 ? (density + 1) as VocabularyStudyDensity : density,
    requiresScroll: overflows && density === 2,
  };
}

export function getVocabularyStudyNavigation(index: number, total: number) {
  const safeTotal = Math.max(1, total);
  const safeIndex = Math.min(Math.max(0, index), safeTotal - 1);
  return {
    canGoPrevious: safeIndex > 0,
    isLast: safeIndex === safeTotal - 1,
    nextLabel: safeIndex === safeTotal - 1 ? 'Começar quiz' : 'Próxima',
  };
}

export type VocabularyQuizQuestion = {
  target: DailyVocabularyWord;
  prompt: string;
  options: DailyVocabularyWord[];
};

function maskWord(example: string | null, word: string): string {
  if (!example) return 'Frase de exemplo indisponível.';
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const masked = example.replace(new RegExp(`\\b${escaped}\\b`, 'i'), '_____');
  return masked === example ? example : masked;
}

export function buildVocabularyQuizQuestions(lesson: DailyVocabularyLesson): VocabularyQuizQuestion[] {
  return lesson.words.slice(0, 3).map((target, index) => ({
    target,
    prompt: maskWord(target.example, target.word),
    options: lesson.words.slice(index, index + 3),
  }));
}

export function getVocabularyEvaluationStatusLabel(status: string): string {
  if (status === 'CORRECT') return 'Muito bem!';
  if (status === 'NEEDS_IMPROVEMENT') return 'Continue praticando';
  if (status === 'INCORRECT') return 'Vamos aprender com essa tentativa';
  return 'Resultado da avaliação';
}

export type PronunciationMatchStatus = 'recognized' | 'close' | 'retry';

export type PronunciationTextSegment = { text: string; changed: boolean };

export type VocabularyPronunciationComparison = {
  status: PronunciationMatchStatus;
  similarity: number;
  expectedSegments: PronunciationTextSegment[];
  recognizedSegments: PronunciationTextSegment[];
};

const PRONUNCIATION_MATCH_THRESHOLD = 0.92;
const PRONUNCIATION_CLOSE_THRESHOLD = 0.65;
const CONTRACTION_EXPANSIONS: Record<string, string> = {
  "i'm": 'i am', "you're": 'you are', "we're": 'we are', "they're": 'they are',
  "i've": 'i have', "you've": 'you have', "we've": 'we have', "they've": 'they have',
  "i'll": 'i will', "you'll": 'you will', "we'll": 'we will', "they'll": 'they will',
  "don't": 'do not', "doesn't": 'does not', "didn't": 'did not',
  "can't": 'cannot', cannot: 'cannot', "won't": 'will not', "isn't": 'is not',
  "aren't": 'are not', "wasn't": 'was not', "weren't": 'were not',
  "couldn't": 'could not', "wouldn't": 'would not', "shouldn't": 'should not',
  "mustn't": 'must not',
};

function normalizePronunciationTokens(value: string): string[] {
  return value
    .toLocaleLowerCase('en-US')
    .replace(/[’‘]/g, "'")
    .match(/[a-z0-9]+(?:'[a-z0-9]+)*/g)
    ?.flatMap((token) => (CONTRACTION_EXPANSIONS[token] ?? token).split(' ')) ?? [];
}

function getWordDifferenceIndexes(expected: string[], recognized: string[]): { expected: Set<number>; recognized: Set<number> } {
  const expectedNormalized = expected.map((token) => normalizePronunciationTokens(token).join(' '));
  const recognizedNormalized = recognized.map((token) => normalizePronunciationTokens(token).join(' '));
  const rows = expected.length + 1;
  const columns = recognized.length + 1;
  const distance = Array.from({ length: rows }, () => Array<number>(columns).fill(0));
  for (let i = 0; i < rows; i += 1) distance[i][0] = i;
  for (let j = 0; j < columns; j += 1) distance[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      distance[i][j] = expectedNormalized[i - 1] === recognizedNormalized[j - 1]
        ? distance[i - 1][j - 1]
        : Math.min(distance[i - 1][j - 1] + 1, distance[i][j - 1] + 1, distance[i - 1][j] + 1);
    }
  }
  const expectedChanged = new Set<number>();
  const recognizedChanged = new Set<number>();
  let i = expected.length;
  let j = recognized.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && expectedNormalized[i - 1] === recognizedNormalized[j - 1]) {
      i -= 1;
      j -= 1;
    } else if (i > 0 && j > 0 && distance[i][j] === distance[i - 1][j - 1] + 1) {
      expectedChanged.add(i - 1);
      recognizedChanged.add(j - 1);
      i -= 1;
      j -= 1;
    } else if (j > 0 && distance[i][j] === distance[i][j - 1] + 1) {
      recognizedChanged.add(j - 1);
      j -= 1;
    } else {
      expectedChanged.add(i - 1);
      i -= 1;
    }
  }
  return { expected: expectedChanged, recognized: recognizedChanged };
}

function getPronunciationSegments(value: string, changedIndexes: Set<number>): PronunciationTextSegment[] {
  const segments: PronunciationTextSegment[] = [];
  const words = /[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g;
  let lastIndex = 0;
  let wordIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = words.exec(value)) !== null) {
    if (match.index > lastIndex) segments.push({ text: value.slice(lastIndex, match.index), changed: false });
    segments.push({ text: match[0], changed: changedIndexes.has(wordIndex) });
    lastIndex = match.index + match[0].length;
    wordIndex += 1;
  }
  if (lastIndex < value.length) segments.push({ text: value.slice(lastIndex), changed: false });
  return segments;
}

export function compareVocabularyPronunciation(expected: string, recognized: string): VocabularyPronunciationComparison {
  const expectedTokens = normalizePronunciationTokens(expected);
  const recognizedTokens = normalizePronunciationTokens(recognized);
  const maxLength = Math.max(expectedTokens.length, recognizedTokens.length);
  const rows = expectedTokens.length + 1;
  const columns = recognizedTokens.length + 1;
  const distance = Array.from({ length: rows }, () => Array<number>(columns).fill(0));
  for (let i = 0; i < rows; i += 1) distance[i][0] = i;
  for (let j = 0; j < columns; j += 1) distance[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      distance[i][j] = expectedTokens[i - 1] === recognizedTokens[j - 1]
        ? distance[i - 1][j - 1]
        : Math.min(distance[i - 1][j - 1] + 1, distance[i][j - 1] + 1, distance[i - 1][j] + 1);
    }
  }
  const similarity = maxLength === 0 ? 0 : Math.max(0, 1 - distance[expectedTokens.length][recognizedTokens.length] / maxLength);
  const status: PronunciationMatchStatus = similarity >= PRONUNCIATION_MATCH_THRESHOLD
    ? 'recognized'
    : similarity >= PRONUNCIATION_CLOSE_THRESHOLD ? 'close' : 'retry';
  const expectedWords = expected.match(/\S+/g) ?? [];
  const recognizedWords = recognized.match(/\S+/g) ?? [];
  const changed = getWordDifferenceIndexes(expectedWords, recognizedWords);
  return {
    status,
    similarity,
    expectedSegments: getPronunciationSegments(expected, changed.expected),
    recognizedSegments: getPronunciationSegments(recognized, changed.recognized),
  };
}

export type DailyVocabularyPresentation = {
  completed: boolean;
  marker: string;
  detail: string;
};

export function getDailyVocabularyPresentation(
  lesson: DailyVocabularyLesson | null,
): DailyVocabularyPresentation | null {
  if (!lesson || lesson.words.length === 0) return null;
  const legacy = lesson as DailyVocabularyLesson & { completedAt?: string | null };
  const completed = Boolean(lesson.progress?.completedAt ?? legacy.completedAt);
  return {
    completed,
    marker: completed ? 'Lição concluída' : 'Lição disponível',
    detail: completed
      ? `${lesson.words.length} palavras praticadas hoje`
      : `${lesson.words.length} palavras preparadas para hoje`,
  };
}

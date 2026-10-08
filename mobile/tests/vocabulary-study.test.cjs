const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadTypeScript(relativePath, dependencies = {}) {
  const file = path.resolve(__dirname, relativePath);
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ URL, FormData: class {} });
  const execute = vm.runInContext(`(function(require, module, exports) {${output}\n})`, context, { filename: file });
  execute((request) => {
    if (Object.prototype.hasOwnProperty.call(dependencies, request)) return dependencies[request];
    throw new Error(`Unexpected runtime import: ${request}`);
  }, module, module.exports);
  return module.exports;
}

const presentation = loadTypeScript('../src/features/vocabulary/vocabulary.presentation.ts', {
  '../../i18n/translate': require('./i18n-helper.cjs'),
});

test('categoria traduzida por código sem alterar palavra de estudo', () => {
  assert.equal(presentation.getVocabularyCategoryLabel('TRAVEL'), 'Viagem');
  const lesson = { words: [{ word: 'environment', example: 'The environment matters.' }] };
  assert.equal(lesson.words[0].word, 'environment');
  assert.equal(lesson.words[0].example, 'The environment matters.');
});
const service = loadTypeScript('../src/features/vocabulary/vocabulary.service.ts', {
  '../../api/authenticated-fetch': { authenticatedFetch: async () => ({ ok: false }) },
});
const audio = loadTypeScript('../src/features/conversations/conversation-audio.service.ts', {
  '../../api/authenticated-fetch': { authenticatedFetch: async () => ({ ok: false }) },
  'expo-file-system': { File: class { constructor() { this.exists = true; this.size = 1; } delete() {} slice() { return this; } } },
});
const studyScreen = fs.readFileSync(path.resolve(__dirname, '../src/features/vocabulary/screens/VocabularyStudyScreen.tsx'), 'utf8');
const studyCard = fs.readFileSync(path.resolve(__dirname, '../src/features/vocabulary/components/VocabularyStudyCard.tsx'), 'utf8');
const pronunciationUi = fs.readFileSync(path.resolve(__dirname, '../src/features/vocabulary/components/VocabularyPronunciationPractice.tsx'), 'utf8');
const translatorVoice = fs.readFileSync(path.resolve(__dirname, '../src/features/translator/audio/use-translator-voice.ts'), 'utf8');
const quizScreen = fs.readFileSync(path.resolve(__dirname, '../src/features/vocabulary/screens/VocabularyQuizScreen.tsx'), 'utf8');

function loadVocabularyService(authenticatedFetch) {
  return loadTypeScript('../src/features/vocabulary/vocabulary.service.ts', {
    '../../api/authenticated-fetch': { authenticatedFetch },
  });
}

test('parser preserva exemplo, tradução e categoria reais', () => {
  const lesson = service.parseDailyVocabularyLesson({
    id: 'lesson', date: '2026-09-30', englishLevel: 'B1', category: 'TRAVEL',
    words: Array.from({ length: 10 }, (_, index) => ({
      id: `word-${index}`, word: `word-${index}`, translation: `translation-${index}`,
      example: `Example ${index}.`, exampleTranslation: `Exemplo ${index}.`, category: 'TRAVEL',
      status: 'NEW', correctCount: 0, incorrectCount: 0, review: false,
    })),
    progress: { quizCompleted: false, quizScore: null, writingCompleted: false, completedAt: null },
  });
  assert.equal(lesson.words[0].example, 'Example 0.');
  assert.equal(lesson.words[0].exampleTranslation, 'Exemplo 0.');
  assert.equal(lesson.words[0].category, 'TRAVEL');
});

test('navegação respeita primeira, última e progresso visual', () => {
  assert.equal(JSON.stringify(presentation.getVocabularyStudyNavigation(0, 10)), JSON.stringify({ canGoPrevious: false, isLast: false, nextLabel: 'Próxima' }));
  assert.equal(JSON.stringify(presentation.getVocabularyStudyNavigation(9, 10)), JSON.stringify({ canGoPrevious: true, isLast: true, nextLabel: 'Começar quiz' }));
  assert.equal(JSON.stringify(presentation.getVocabularyStudyProgress(0, 10)), JSON.stringify({ fraction: 0.1, label: '1 de 10' }));
  assert.equal(JSON.stringify(presentation.getVocabularyStudyProgress(9, 10)), JSON.stringify({ fraction: 1, label: '10 de 10' }));
});

test('layout normal cabe sem compactar; overflow real reduz densidade em etapas limitadas', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(presentation.getVocabularyStudyFit(0, 500, 480))), { density: 0, requiresScroll: false });
  assert.deepEqual(JSON.parse(JSON.stringify(presentation.getVocabularyStudyFit(0, 500, 550))), { density: 1, requiresScroll: false });
  assert.deepEqual(JSON.parse(JSON.stringify(presentation.getVocabularyStudyFit(1, 500, 540))), { density: 2, requiresScroll: false });
  assert.deepEqual(JSON.parse(JSON.stringify(presentation.getVocabularyStudyFit(2, 500, 530))), { density: 2, requiresScroll: true });
  assert.deepEqual(JSON.parse(JSON.stringify(presentation.getVocabularyStudyFit(2, 500, 499))), { density: 2, requiresScroll: false });
});

test('TTS de vocabulário envia somente texto e idioma inglês', async () => {
  const calls = [];
  const speech = loadTypeScript('../src/features/conversations/conversation-audio.service.ts', {
    '../../api/authenticated-fetch': { authenticatedFetch: async (path, options) => {
      calls.push({ path, options });
      return { ok: true, status: 200, headers: { get: () => 'audio/wav' }, arrayBuffer: async () => new Uint8Array([1]).buffer };
    } },
    'expo-file-system': { File: class { constructor() { this.exists = true; this.size = 1; } delete() {} slice() { return this; } } },
  });
  await speech.synthesizeSpeech('airport');
  await speech.synthesizeSpeech('I am at the airport.');
  assert.equal(calls[0].path, '/api/v1/speech');
  assert.deepEqual(JSON.parse(calls[0].options.body), { language: 'en', text: 'airport' });
  assert.deepEqual(JSON.parse(calls[1].options.body), { language: 'en', text: 'I am at the airport.' });
});

test('quiz monta três questões com palavras reais da lição', () => {
  const lesson = {
    words: Array.from({ length: 10 }, (_, index) => ({
      id: `word-${index}`, word: `word-${index}`, translation: `translation-${index}`,
      example: `Use word-${index} here.`, exampleTranslation: null, category: 'TRAVEL', status: 'NEW', review: false,
    })),
  };
  const questions = presentation.buildVocabularyQuizQuestions(lesson);
  assert.equal(questions.length, 3);
  assert.equal(questions[0].target.id, 'word-0');
  assert.equal(questions[1].target.id, 'word-1');
  assert.equal(questions[2].target.id, 'word-2');
  assert.equal(questions[0].options.length, 3);
  assert.match(questions[0].prompt, /_____/);
});

test('quiz e frase livre usam os payloads reais', async () => {
  const calls = [];
  const vocabulary = loadVocabularyService(async (path, options) => {
    calls.push({ path, options });
    if (path.endsWith('/quiz')) {
      return { ok: true, status: 200, json: async () => ({ score: 2, total: 3, progress: { quizCompleted: true, quizScore: 2, writingCompleted: false, completedAt: null } }) };
    }
    return { ok: true, status: 200, json: async () => ({ status: 'NEEDS_IMPROVEMENT', correctedSentence: 'I travel often.', explanation: 'Boa ideia.', alternative: null, progress: { quizCompleted: true, quizScore: 2, writingCompleted: true, completedAt: '2026-09-30T10:00:00Z' } }) };
  });
  const quiz = await vocabulary.submitVocabularyQuiz('lesson-id', [
    { wordId: 'word-0', selectedWordId: 'word-0' },
    { wordId: 'word-1', selectedWordId: 'word-3' },
    { wordId: 'word-2', selectedWordId: 'word-2' },
  ]);
  const evaluation = await vocabulary.evaluateVocabularySentence('lesson-id', 'word-4', 'I travel often.');
  assert.equal(quiz.total, 3);
  assert.equal(evaluation.status, 'NEEDS_IMPROVEMENT');
  assert.equal(calls.length, 2);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    lessonId: 'lesson-id',
    answers: [
      { wordId: 'word-0', selectedWordId: 'word-0' },
      { wordId: 'word-1', selectedWordId: 'word-3' },
      { wordId: 'word-2', selectedWordId: 'word-2' },
    ],
  });
  assert.deepEqual(JSON.parse(calls[1].options.body), { lessonId: 'lesson-id', sentence: 'I travel often.', wordId: 'word-4' });
});

test('falha do quiz não faz retry automático', async () => {
  let calls = 0;
  const vocabulary = loadVocabularyService(async () => {
    calls += 1;
    return { ok: false, status: 503 };
  });
  await assert.rejects(vocabulary.submitVocabularyQuiz('lesson-id', []), (error) => error.status === 503);
  assert.equal(calls, 1);
});

test('falha da avaliação retorna erro sem novo POST', async () => {
  let calls = 0;
  const vocabulary = loadVocabularyService(async () => {
    calls += 1;
    return { ok: false, status: 400 };
  });
  await assert.rejects(vocabulary.evaluateVocabularySentence('lesson-id', 'word-0', 'A sentence.'), (error) => error.status === 400);
  assert.equal(calls, 1);
});

test('comparação da frase ignora caixa, pontuação, espaços e contrações comuns', () => {
  const exact = presentation.compareVocabularyPronunciation(
    'I usually wake up early in the morning.',
    '  I USUALLY wake up early in the morning  ',
  );
  assert.equal(exact.status, 'recognized');
  assert.equal(exact.similarity, 1);

  const contraction = presentation.compareVocabularyPronunciation("I'm ready, and we don't need to wait.", 'I am ready and we do not need to wait');
  assert.equal(contraction.status, 'recognized');
  assert.equal(contraction.similarity, 1);
});

test('comparação tolera uma diferença pequena e destaca palavras divergentes', () => {
  const result = presentation.compareVocabularyPronunciation(
    'We need to protect the environment for future generations.',
    'We need to protect the environment for future generation.',
  );
  assert.equal(result.status, 'close');
  assert.deepEqual(Array.from(result.expectedSegments.filter((segment) => segment.changed), (segment) => segment.text), ['generations']);
  assert.deepEqual(Array.from(result.recognizedSegments.filter((segment) => segment.changed), (segment) => segment.text), ['generation']);
  assert.ok(!result.status.includes('%'));

  const veryDifferent = presentation.compareVocabularyPronunciation('I usually wake up early in the morning.', 'Please close the window before dinner.');
  assert.equal(veryDifferent.status, 'retry');
});

test('prática de pronúncia é opcional, por frase, reutiliza TTS e STT existentes e não bloqueia o estudo', () => {
  assert.match(studyScreen, /useTranslatorVoice\(\{ language: 'en', onTranscribed: onPronunciationTranscribed \}\)/);
  assert.match(studyScreen, /stopSpeech\(\);\s*void startPronunciationRecording\(\)/);
  assert.match(studyScreen, /compareVocabularyPronunciation\(session\.expected, recognized\)/);
  assert.match(studyScreen, /pronunciationCompleted\[word\.id\]/);
  assert.match(studyScreen, /<VocabularyPronunciationPractice/);
  assert.match(studyScreen, /onStop=\{\(\) => void stopPronunciationRecording\(\)\}/);
  assert.match(studyScreen, /onCancel=\{\(\) => \{[\s\S]*cancelPronunciation\(\)/);
  assert.match(studyScreen, /getVocabularyStudyNavigation/);
  assert.match(studyScreen, /router\.push\('\/practice\/vocabulary-quiz'\)/);
  assert.match(studyScreen, /abandonRecordingForNavigation/);
  assert.match(studyCard, /onPlayAudio\('example', word\.example/);
  assert.match(studyCard, /accessibilityLabel="Ouvir frase"/);
  assert.match(pronunciationUi, /label="Ouvir frase"/);
  assert.match(studyScreen, /onPlaySentence=\{\(\) => onAudio\('example', word\.example/);
  assert.match(translatorVoice, /transcribeConversationAudio\(/);
  assert.match(translatorVoice, /requestRecordingPermissionsAsync\(\)/);
  assert.match(translatorVoice, /RecordingPresets\.HIGH_QUALITY/);
  assert.match(pronunciationUi, /Bônus · Opcional/);
  assert.match(pronunciationUi, /Praticar frase/);
  assert.match(pronunciationUi, /Gravando\.\.\./);
  assert.match(pronunciationUi, /Analisando sua fala/);
  assert.match(pronunciationUi, /Muito bem!/);
  assert.match(pronunciationUi, /Quase lá!/);
  assert.match(pronunciationUi, /Você disse/);
  assert.match(pronunciationUi, /Tentar novamente/);
  assert.match(pronunciationUi, /Pronúncia praticada nesta sessão/);
  assert.doesNotMatch(pronunciationUi, /Pronúncia:\s*\$?\{/);
});

test('estudo usa posição real no header, progresso, dados reais e navegação bidirecional', () => {
  assert.match(studyScreen, /right=\{progress \? <Text style=\{styles\.headerCount\}>\{progress\.label\}<\/Text>/);
  assert.match(studyScreen, /accessibilityRole="progressbar"/);
  assert.match(studyScreen, /progress\.fraction \* 100/);
  assert.match(studyCard, /\{word\.word\}/);
  assert.match(studyCard, /\{word\.translation\}/);
  assert.match(studyCard, /\{word\.example\}/);
  assert.match(studyCard, /\{word\.exampleTranslation\}/);
  assert.match(studyCard, /Tema · \{categoryLabel\}/);
  assert.match(studyScreen, /<ScrollView/);
  assert.match(studyScreen, /onPress=\{goToPreviousWord\}/);
  assert.match(studyScreen, /disabled=\{!navigation\.canGoPrevious\}/);
  assert.match(studyScreen, /Math\.max\(0, current - 1\)/);
  assert.match(studyScreen, /onPress=\{goToNextWordOrQuiz\}/);
  assert.match(studyScreen, /navigation\.isLast\) router\.push\('\/practice\/vocabulary-quiz'\)/);
});

test('Vocabulary measures viewport and content, keeps navigation outside scrolling content and never truncates phrases', () => {
  assert.match(studyScreen, /onLayout=\{\(event\) => \{/);
  assert.match(studyScreen, /onContentSizeChange=\{\(_width, height\) => \{/);
  assert.match(studyScreen, /getVocabularyStudyFit\(density, viewportHeight, height\)/);
  assert.match(studyScreen, /fitState\.key === layoutKey \? fitState : null/);
  assert.match(studyScreen, /lesson && word && !layoutReady && styles\.measuring/);
  assert.match(studyScreen, /ready: nextFit\.density === density/);
  assert.match(studyScreen, /<\/ScrollView>\s*\{lesson && word && navigation \? <View style=\{styles\.navigation\}>/);
  assert.match(studyScreen, /showsVerticalScrollIndicator=\{requiresScroll\}/);
  assert.match(studyCard, /density > 0 && styles\.cardCompact/);
  assert.match(pronunciationUi, /density === 2 && styles\.feedbackTight/);
  assert.doesNotMatch(studyCard, /numberOfLines/);
  assert.doesNotMatch(pronunciationUi, /numberOfLines/);
});

test('prática mostra estados reais sem obrigar a participação', () => {
  assert.match(pronunciationUi, /Date\.now\(\)/);
  assert.match(pronunciationUi, /clearInterval\(timer\)/);
  assert.match(pronunciationUi, /Parar gravação/);
  assert.match(pronunciationUi, /onPress=\{onCancel\}/);
  assert.match(pronunciationUi, /Analisando sua fala/);
  assert.match(pronunciationUi, /Muito bem!/);
  assert.match(pronunciationUi, /Quase lá!/);
  assert.match(pronunciationUi, /Não foi reconhecido/);
  assert.match(pronunciationUi, /Não foi possível analisar/);
  assert.match(pronunciationUi, /comparison\.expectedSegments\.map/);
  assert.match(pronunciationUi, /comparison\.recognizedSegments\.map/);
  assert.match(studyScreen, /pronunciationTranscripts\[word\.id\]/);
  assert.match(studyScreen, /pronunciationCompleted\[word\.id\]/);
  assert.doesNotMatch(studyScreen, /pronunciationCompleted\[word\.id\].*disabled/);
});

test('VocabularyQuizScreen declara todos os hooks antes do retorno de loading', () => {
  const component = quizScreen.slice(quizScreen.indexOf('export function VocabularyQuizScreen'), quizScreen.indexOf('\nfunction ErrorState'));
  const loadingReturn = component.indexOf("if (phase === 'loading') return");
  assert.ok(loadingReturn > 0);
  for (const match of component.matchAll(/\buse(?:State|Effect|Callback|Memo|Ref|DeterministicBack)\s*\(/g)) {
    assert.ok(match.index < loadingReturn, `Hook ${match[0]} appears after the loading branch`);
  }
  assert.ok(component.indexOf('const confirmQuestion = useCallback') < loadingReturn);
  assert.ok(component.indexOf('const evaluateSentence = useCallback') < loadingReturn);
});

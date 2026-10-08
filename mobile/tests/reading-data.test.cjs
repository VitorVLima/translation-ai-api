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
  const context = vm.createContext({});
  const execute = vm.runInContext(`(function(require, module, exports) {${output}\n})`, context, { filename: file });
  execute((request) => {
    if (Object.prototype.hasOwnProperty.call(dependencies, request)) return dependencies[request];
    throw new Error(`Unexpected runtime import: ${request}`);
  }, module, module.exports);
  return module.exports;
}

const source = fs.readFileSync(path.resolve(__dirname, '../src/features/reading/reading.service.ts'), 'utf8');
const screen = fs.readFileSync(path.resolve(__dirname, '../src/features/reading/screens/ReadingActivityScreen.tsx'), 'utf8');
const listScreen = fs.readFileSync(path.resolve(__dirname, '../src/features/reading/screens/ReadingScreen.tsx'), 'utf8');
const setup = fs.readFileSync(path.resolve(__dirname, '../src/features/reading/screens/ReadingSetupScreen.tsx'), 'utf8');
const questionsScreen = fs.readFileSync(path.resolve(__dirname, '../src/features/reading/screens/ReadingQuestionsScreen.tsx'), 'utf8');
const questionsRoute = fs.readFileSync(path.resolve(__dirname, '../app/(app)/practice/reading/[id]/questions.tsx'), 'utf8');
class TestSessionError extends Error {
  constructor(kind) { super(kind); this.kind = kind; }
}

function loadReadingService(authenticatedFetch) {
  return loadTypeScript('../src/features/reading/reading.service.ts', {
    '../../api/authenticated-fetch': { authenticatedFetch },
    '../auth/auth.session': { SessionError: TestSessionError },
  });
}

const service = loadReadingService(async () => ({ ok: false, status: 403 }));
const presentation = loadTypeScript('../src/features/reading/reading.presentation.ts');

test('leitura legada encerrada sem respostas não é apresentada como desempenho ruim', () => {
  const withoutResult = { status: 'NEEDS_PRACTICE', correctAnswers: null, comprehensionPercentage: null };
  assert.equal(presentation.isReadingClosedWithoutResult(withoutResult), true);
  assert.equal(presentation.isReadingClosedWithoutResult({ ...withoutResult, correctAnswers: 1, comprehensionPercentage: 33 }), false);
  assert.equal(presentation.isReadingClosedWithoutResult({ ...withoutResult, status: 'IN_PROGRESS' }), false);
  const card = fs.readFileSync(path.resolve(__dirname, '../src/features/reading/components/ReadingActivityCard.tsx'), 'utf8');
  const result = fs.readFileSync(path.resolve(__dirname, '../src/features/reading/components/ReadingResultView.tsx'), 'utf8');
  assert.match(card, /withoutResult \? 'Sem resultado'/);
  assert.match(result, /Esta leitura foi encerrada sem respostas/);
});

test('Reading usa os endpoints reais de listagem, detalhe, geração, dicas e tradução', () => {
  for (const endpoint of ['/api/v1/reading', '/api/v1/reading/${encodeURIComponent(activityId)}', '/api/v1/reading/generate', '/api/v1/reading/hint', '/api/v1/translate']) {
    assert.match(source, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('parsers aceitam resumo, detalhe ativo e geração com os DTOs reais', () => {
  const activityId = '9aa4feaa-b845-4e5b-886f-bda68dd93111';
  const summary = {
    activityId, title: 'A Short Trip', difficulty: 'INTERMEDIATE', topic: 'TRAVEL', status: 'IN_PROGRESS', questionCount: 3,
    correctAnswers: null, comprehensionPercentage: null,
    createdAt: '2026-09-30T10:00:00Z', completedAt: null,
  };
  assert.equal(service.parseReadingActivityList([summary])[0].activityId, activityId);
  const detail = service.parseReadingActivityDetail({ ...summary, text: 'A short trip.', questions: [] });
  assert.equal(detail.text, 'A short trip.');
  assert.equal(detail.hints, null);
  const persistedHint = { expression: 'short trip', explanation: 'Uma viagem breve.', type: 'EXPRESSION' };
  assert.equal(service.parseReadingActivityDetail({ ...summary, text: 'A short trip.', questions: [], hints: [persistedHint] }).hints[0].expression, 'short trip');
  const generated = service.parseReadingGenerateResponse({ activityId, title: 'A Short Trip', text: 'A passage.', difficulty: 'INTERMEDIATE', topic: 'TRAVEL' });
  assert.equal(generated.activityId, activityId);
  assert.equal(generated.text, 'A passage.');
  assert.equal(generated.title, 'A Short Trip');
  assert.equal(generated.difficulty, 'INTERMEDIATE');
  assert.equal(generated.topic, 'TRAVEL');
  assert.equal(service.parseReadingActivityList([{ ...summary, title: '' }]), null);
  assert.equal(service.parseReadingGenerateResponse({ activityId, text: 'A passage.', difficulty: 'INTERMEDIATE', topic: 'TRAVEL' }), null);
});

test('busca local encontra título ou tema, ignorando caixa, acentos e espaços extras', () => {
  const activities = [
    { title: 'How Smartphones Changed Our Lives', topic: 'TECHNOLOGY' },
    { title: 'A Weekend in London', topic: 'TRAVEL' },
  ];
  assert.deepEqual(presentation.filterReadingActivities(activities, '  SMARTPHONES  '), [activities[0]]);
  assert.deepEqual(presentation.filterReadingActivities(activities, ' tecnologia '), [activities[0]]);
  assert.deepEqual(presentation.filterReadingActivities(activities, ' weekend   in london '), [activities[1]]);
  assert.deepEqual(presentation.filterReadingActivities(activities, '  '), activities);
});

test('lista prioriza título e mantém busca, ação e histórico na ordem', () => {
  const hero = fs.readFileSync(path.resolve(__dirname, '../src/features/reading/components/ReadingIntroHero.tsx'), 'utf8');
  const card = fs.readFileSync(path.resolve(__dirname, '../src/features/reading/components/ReadingActivityCard.tsx'), 'utf8');
  assert.match(hero, /Image\.resolveAssetSource\(image\)/);
  assert.match(hero, /Pratique sua leitura em inglês/);
  assert.match(card, /\{activity\.title\}/);
  assert.ok(listScreen.indexOf('<ReadingIntroHero />') < listScreen.indexOf('placeholder="Buscar leituras..."'));
  assert.ok(listScreen.indexOf('placeholder="Buscar leituras..."') < listScreen.indexOf('Nova leitura'));
  assert.ok(listScreen.indexOf('Nova leitura') < listScreen.indexOf('Histórico'));
});

test('parsers match Jackson NON_NULL responses for active questions and details', () => {
  const activityId = '9aa4feaa-b845-4e5b-886f-bda68dd93111';
  const question = {
    id: '9aa4feaa-b845-4e5b-886f-bda68dd93112',
    type: 'MAIN_IDEA',
    question: 'What happened?',
    options: ['A', 'B', 'C', 'D'],
  };
  const activeQuestionPayload = [
    question,
    { ...question, id: '9aa4feaa-b845-4e5b-886f-bda68dd93113', type: 'DETAIL' },
    { ...question, id: '9aa4feaa-b845-4e5b-886f-bda68dd93114', type: 'VOCABULARY' },
  ];
  const activeQuestions = service.parseReadingQuestions({ questions: activeQuestionPayload });
  assert.equal(activeQuestions.length, 3);
  assert.equal(activeQuestions[0].correctOption, null);
  assert.equal(activeQuestions[0].explanation, null);
  const activeDetail = service.parseReadingActivityDetail({
    activityId, title: 'A Short Trip', difficulty: 'INTERMEDIATE', topic: 'TRAVEL', status: 'IN_PROGRESS',
    questionCount: 3, correctAnswers: null, comprehensionPercentage: null,
    createdAt: '2026-09-30T10:00:00Z', completedAt: null, text: 'A short trip.',
    questions: activeQuestionPayload,
  });
  assert.equal(activeDetail.questions[0].correctOption, null);
  assert.equal(activeDetail.questions[0].explanation, null);
  const completedDetail = service.parseReadingActivityDetail({
    activityId, title: 'A Short Trip', difficulty: 'INTERMEDIATE', topic: 'TRAVEL', status: 'SUCCESS',
    questionCount: 3, correctAnswers: 3, comprehensionPercentage: 100,
    createdAt: '2026-09-30T10:00:00Z', completedAt: '2026-09-30T10:10:00Z', text: 'A short trip.',
    questions: activeQuestionPayload.map((value, index) => ({ ...value, correctOption: index, explanation: 'Resposta persistida.' })),
  });
  assert.equal(completedDetail.questions[0].correctOption, 0);
  assert.equal(completedDetail.questions[0].explanation, 'Resposta persistida.');
});

test('questions screen guards initial loading and permits only explicit retry after failure', () => {
  assert.match(questionsScreen, /questionsRequest/);
  assert.match(questionsScreen, /loadedQuestions\.current\?\.activityId === activityId/);
  assert.match(questionsScreen, /void loadQuestions\(true\)/);
});

test('reading questions keep exactly three persisted questions and screen order', () => {
  const questions = ['MAIN_IDEA', 'DETAIL', 'VOCABULARY'].map((type, index) => ({
    id: `9aa4feaa-b845-4e5b-886f-bda68dd9311${index + 1}`,
    type,
    question: `Question ${index + 1}`,
    options: ['A', 'B', 'C', 'D'],
    correctOption: null,
    explanation: null,
  }));
  assert.deepEqual(service.parseReadingQuestions({ questions }).map((question) => question.type), ['MAIN_IDEA', 'DETAIL', 'VOCABULARY']);
  assert.equal(service.parseReadingQuestions({ questions: questions.slice(0, 2) }), null);
  assert.match(questionsRoute, /ReadingQuestionsScreen/);
  assert.match(questionsScreen, /currentIndex \+ 1/);
  assert.match(questionsScreen, /goToPreviousQuestion/);
  assert.match(questionsScreen, /goToNextQuestion/);
  assert.match(questionsScreen, /typeof answers\[question\.id\] === 'number'/);
  assert.match(questionsScreen, /setAnswers\(\(current\) => \(\{ \.\.\.current, \[currentQuestion\.id\]: option \}\)\)/);
});

test('quiz permite revisar respostas e só finaliza explicitamente quando todas foram respondidas', () => {
  assert.match(questionsScreen, /const answeredCount = questions\.reduce/);
  assert.match(questionsScreen, /const allAnswered = questions\.length > 0 && answeredCount === questions\.length/);
  assert.match(questionsScreen, /\{answeredCount\} de \{questions\.length\} respondidas/);
  assert.match(questionsScreen, /setCurrentIndex\(\(value\) => Math\.max\(0, value - 1\)\)/);
  assert.match(questionsScreen, /setCurrentIndex\(\(value\) => Math\.min\(questions\.length - 1, value \+ 1\)\)/);
  assert.match(questionsScreen, /onPress=\{goToPreviousQuestion\}/);
  assert.match(questionsScreen, /onPress=\{goToNextQuestion\}/);
  assert.match(questionsScreen, /\{allAnswered \? <Pressable[\s\S]*?>Encerrar<\/Text>/);
  assert.match(questionsScreen, /Responda todas as perguntas para encerrar\./);
  assert.doesNotMatch(questionsScreen, /currentIndex === questions\.length - 1\) \{ void submit\(\)/);
  assert.match(questionsScreen, /submissionInFlight\.current \|\|/);
  assert.match(questionsScreen, /submissionInFlight\.current = true/);
  assert.match(questionsScreen, /setPhase\('quiz'\);\s*setError\(reason/);
  assert.match(questionsScreen, /phase === 'submitting' \? <>[\s\S]*?Encerrando\.\.\./);
  assert.match(questionsScreen, /onPress=\{\(\) => void submit\(\)\}/);
  assert.match(questionsScreen, /onPress=\{\(\) => setConsultingText\(true\)\}/);
  assert.match(questionsScreen, /if \(consultingText\) return <ReadingActivityScreen onReturnToQuestions=\{returnToQuestions\} \/>/);
  assert.match(questionsScreen, /const returnToQuestions = useCallback\(\(\) => setConsultingText\(false\), \[\]\)/);
});

test('submit sends exactly three answers with selectedOption as an index', async () => {
  const calls = [];
  const activityId = '9aa4feaa-b845-4e5b-886f-bda68dd93111';
  const reading = loadReadingService(async (requestPath, options) => {
    calls.push({ requestPath, options });
    return {
      ok: true,
      status: 200,
      async json() {
        return { activityId, correctAnswers: 2, totalQuestions: 3, percentage: 67, status: 'SUCCESS', difficulty: 'INTERMEDIATE' };
      },
    };
  });
  const result = await reading.submitReadingAnswers(activityId, [
    { questionId: '9aa4feaa-b845-4e5b-886f-bda68dd93111', selectedOption: 0 },
    { questionId: '9aa4feaa-b845-4e5b-886f-bda68dd93112', selectedOption: 2 },
    { questionId: '9aa4feaa-b845-4e5b-886f-bda68dd93113', selectedOption: 1 },
  ]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].requestPath, `/api/v1/reading/${activityId}/submit`);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    answers: [
      { questionId: '9aa4feaa-b845-4e5b-886f-bda68dd93111', selectedOption: 0 },
      { questionId: '9aa4feaa-b845-4e5b-886f-bda68dd93112', selectedOption: 2 },
      { questionId: '9aa4feaa-b845-4e5b-886f-bda68dd93113', selectedOption: 1 },
    ],
  });
  assert.equal(result.totalQuestions, 3);
  assert.equal(result.percentage, 67);
  assert.match(questionsScreen, /submitted\.current/);
});

test('completed activity renders persisted result instead of another quiz', () => {
  assert.match(screen, /detail\.status !== 'IN_PROGRESS' \? <ReadingResultView/);
  assert.match(screen, /onReturnToQuestions \|\| detail\.status === 'IN_PROGRESS'/);
});

test('consulta do texto preserva a tentativa e usa a mesma Reading com Dicas e TTS', () => {
  const backHook = fs.readFileSync(path.resolve(__dirname, '../src/hooks/use-deterministic-back.ts'), 'utf8');
  assert.match(questionsScreen, /useState<ReadingQuestion\[\]>\(\[\]\)/);
  assert.match(questionsScreen, /const \[currentIndex, setCurrentIndex\] = useState\(0\)/);
  assert.match(questionsScreen, /const \[answers, setAnswers\] = useState<Record<string, number>>\(\{\}\)/);
  assert.match(questionsScreen, /const \[consultingText, setConsultingText\] = useState\(false\)/);
  assert.match(questionsScreen, /phase === 'quiz' \? <Pressable/);
  assert.match(questionsScreen, /onPress=\{\(\) => setConsultingText\(true\)\}/);
  assert.match(questionsScreen, />Ver texto<\/Text>/);
  assert.match(questionsScreen, /if \(consultingText\) return <ReadingActivityScreen onReturnToQuestions=\{returnToQuestions\} \/>/);
  assert.match(questionsScreen, /const returnToQuestions = useCallback\(\(\) => setConsultingText\(false\), \[\]\)/);
  assert.ok(questionsScreen.indexOf('const [answers, setAnswers]') < questionsScreen.indexOf('if (consultingText) return'));
  assert.match(questionsScreen, /useEffect\(\(\) => \{\s*mounted\.current = true;[\s\S]*?queueMicrotask\(\(\) => \{ if \(active\) void loadQuestions\(\); \}\);[\s\S]*?\}, \[loadQuestions\]\)/);
  assert.match(questionsScreen, /useDeterministicBack\(goBack, !consultingText\)/);
  assert.match(backHook, /if \(!enabled\) return/);
  assert.match(screen, /Consultando durante o quiz/);
  assert.match(screen, /onReturnToQuestions \? 'Voltar às perguntas' : 'Responder perguntas'/);
  assert.match(screen, /onPress=\{onReturnToQuestions \?\? \(\(\) => router\.push/);
  assert.match(screen, /if \(selectedHintIndex !== null\) \{\s*setSelectedHintIndex\(null\);\s*return false;\s*\}\s*if \(onReturnToQuestions\)/);
  assert.match(screen, /playSpeech\('word', detail\.text\)/);
  assert.match(screen, /onPress=\{toggleHints\}/);
  assert.match(screen, /onPress=\{segment\.hintIndex !== null \? \(\) => setSelectedHintIndex\(segment\.hintIndex\) : undefined\}/);
  assert.doesNotMatch(questionsScreen.slice(questionsScreen.indexOf('const returnToQuestions'), questionsScreen.indexOf('if (phase === \'loading\')')), /submitReadingAnswers|setCurrentIndex\(0\)|setAnswers\(\{\}\)|getReadingQuestions/);
});

test('configuração envia dificuldade e tema uma única vez e navega pelo activityId', () => {
  assert.match(setup, /generateReading\(difficulty, topic\)/);
  assert.match(setup, /if \(generating\) return/);
  assert.match(setup, /router\.replace\(`\/practice\/reading\/\$\{activity\.activityId\}`\)/);
});

test('leitura usa TTS e dicas, sem ação de tradução, e preserva perguntas', () => {
  const sheet = fs.readFileSync(path.resolve(__dirname, '../src/features/reading/components/ReadingHintsSheet.tsx'), 'utf8');
  const speechHook = fs.readFileSync(path.resolve(__dirname, '../src/features/vocabulary/audio/use-vocabulary-speech.ts'), 'utf8');
  assert.match(screen, /playSpeech\('word', detail\.text\)/);
  assert.match(screen, /getReadingHintsForActivity\(detail\.activityId\)/);
  assert.match(screen, /setHints\(result\.hints\)/);
  assert.doesNotMatch(screen, /translateReading|Traduzir|Tradução/);
  assert.match(screen, /loadingKey === 'word' \? 'Carregando\.\.\.'/);
  assert.match(screen, /disabled=\{loadingKey !== null\}/);
  assert.match(screen, /<ReadingHintsSheet/);
  assert.match(screen, /onPress=\{toggleHints\}/);
  assert.match(screen, /hintsEnabled && hints \? hints\.map/);
  assert.match(screen, /setHintsEnabled\(false\)/);
  assert.match(screen, /setSelectedHintIndex\(null\)/);
  assert.match(screen, /onPress=\{segment\.hintIndex !== null \? \(\) => setSelectedHintIndex\(segment\.hintIndex\) : undefined\}/);
  assert.match(sheet, /if \(!hint\) return null/);
  assert.match(sheet, /getReadingHintContext\(readingText, hint\.expression\)/);
  assert.doesNotMatch(sheet, /hints\?\.map|hints\.map/);
  assert.doesNotMatch(sheet, /<Modal|backdrop|rgba\(|backgroundColor:\s*['"](?:black|#000)/);
  assert.match(sheet, /pointerEvents="box-none"/);
  assert.match(sheet, /backgroundColor: '#f3f1ff'/);
  assert.match(sheet, /borderColor: '#d9d3ff'/);
  assert.match(sheet, /elevation: 6/);
  assert.match(sheet, /accessibilityLabel="Fechar dica"[^>]+onPress=\{onClose\}/);
  assert.match(screen, /selectedHintIndex !== null && \{ paddingBottom: hintCardHeight \+ 32 \}/);
  assert.match(screen, /onHeightChange=\{setHintCardHeight\}/);
  assert.match(screen, /highlight: \{ color: '#5147df', fontWeight: '600' \}/);
  assert.doesNotMatch(screen, /textDecorationLine: 'underline'/);
  assert.match(screen, /if \(selectedHintIndex !== null\) \{\s*setSelectedHintIndex\(null\)/);
  assert.match(screen, /if \(hintsEnabled\) \{\s*setHintsEnabled\(false\);\s*setSelectedHintIndex\(null\)/);
  assert.match(sheet, /maxHeight: '45%'/);
  assert.ok(speechHook.indexOf('setLoadingKey(key)') < speechHook.indexOf('await setAudioModeAsync'));
  assert.match(speechHook, /if \(!text\.trim\(\) \|\| requestInFlight\.current\) return/);
  assert.match(screen, /\{detail\.title\?\.trim\(\) \|\| getReadingTopicLabel\(detail\.topic\)\}/);
  assert.match(screen, /getReadingDifficultyCefr\(detail\.difficulty\)/);
  assert.match(screen, /getReadingTopicLabel\(detail\.topic\)/);
  assert.match(screen, /\{segment\.text\}/);
  assert.match(screen, /\/questions/);
  assert.match(screen, /detail\.status === 'IN_PROGRESS'/);
});

test('dicas maiores não são cortadas após a quinta entrada no mobile', () => {
  const items = Array.from({ length: 10 }, (_, index) => ({ expression: `term${index}`, explanation: 'Uso no texto.', type: 'VOCABULARY' }));
  assert.equal(service.parseReadingHints({ items }).length, 10);
});

test('dicas de atividades usam o endpoint persistido, sem enviar o texto para seleção no mobile', async () => {
  const activityId = '9aa4feaa-b845-4e5b-886f-bda68dd93111';
  const calls = [];
  const reading = loadReadingService(async (requestPath) => {
    calls.push(requestPath);
    return { ok: true, status: 200, async json() { return { items: [{ expression: 'look forward to', explanation: 'Aguardar com expectativa.', type: 'EXPRESSION' }] }; } };
  });
  const hints = await reading.getReadingHintsForActivity(activityId);
  assert.deepEqual(calls, [`/api/v1/reading/${activityId}/hints`]);
  assert.equal(hints[0].expression, 'look forward to');
});

test('tempo estimado cresce com as palavras sem persistir no Backend', () => {
  assert.equal(presentation.estimateReadingMinutes(''), 1);
  assert.equal(presentation.estimateReadingMinutes('word '.repeat(120)), 1);
  assert.equal(presentation.estimateReadingMinutes('word '.repeat(121)), 2);
});

test('dicas destacam expressão composta, ignoram caixa e preservam texto e pontuação', () => {
  const text = 'I look forward to Monday. LOOK FORWARD TO the trip! Communication helps us communicate.';
  const plain = presentation.getHighlightedReadingSegments(text, []);
  assert.equal(plain.length, 1);
  assert.equal(plain[0].highlighted, false);
  const segments = presentation.getHighlightedReadingSegments(text, ['look forward to', 'communicate']);
  assert.equal(segments.map((segment) => segment.text).join(''), text);
  assert.deepEqual(Array.from(segments.filter((segment) => segment.highlighted), (segment) => segment.text),
    ['look forward to', 'LOOK FORWARD TO', 'communicate']);
  assert.deepEqual(Array.from(segments.filter((segment) => segment.highlighted), (segment) => segment.hintIndex), [0, 0, 1]);
  assert.equal(plain[0].hintIndex, null);
  assert.equal(presentation.getReadingHintContext(text, 'look forward to'), 'I look forward to Monday.');
  assert.equal(presentation.getHighlightedReadingSegments(text, []).map((segment) => segment.text).join(''), text);
  const wrapped = 'I look\nforward to Saturday, too.';
  assert.deepEqual(Array.from(presentation.getHighlightedReadingSegments(wrapped, ['look forward to']).filter((segment) => segment.highlighted), (segment) => segment.text), ['look\nforward to']);
});

test('leitura em andamento mantém o destaque e não oferece uma segunda leitura', () => {
  assert.match(listScreen, /status === 'success' && active/);
  assert.match(listScreen, /disabled=\{status === 'success' && active !== null\}/);
});

test('leitura em andamento pode ser excluída sem oferecer exclusão para concluídas', () => {
  const card = fs.readFileSync(path.resolve(__dirname, '../src/features/reading/components/ReadingActivityCard.tsx'), 'utf8');
  assert.match(source, /method: 'DELETE'/);
  assert.match(listScreen, /deleteReadingActivity/);
  assert.match(listScreen, /Alert\.alert/);
  assert.match(card, /!completed && onDelete/);
});

test('deleteReadingActivity usa o endpoint autenticado e não repete a operação', async () => {
  const calls = [];
  const reading = loadReadingService(async (requestPath, options) => {
    calls.push({ requestPath, options });
    return { ok: true, status: 204 };
  });
  await reading.deleteReadingActivity('9aa4feaa-b845-4e5b-886f-bda68dd93111');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].requestPath, '/api/v1/reading/9aa4feaa-b845-4e5b-886f-bda68dd93111');
  assert.equal(calls[0].options.method, 'DELETE');
});

test('Reading usa a hierarquia de Back determinística e consome o Android Back', () => {
  const destinations = loadTypeScript('../src/navigation/back-destinations.ts');
  const hook = fs.readFileSync(path.resolve(__dirname, '../src/hooks/use-deterministic-back.ts'), 'utf8');
  assert.equal(destinations.getBackDestination('reading'), '/practice');
  assert.equal(destinations.getBackDestination('readingActivity'), '/practice/reading');
  assert.equal(destinations.getBackDestination('readingSetup'), '/practice/reading');
  assert.match(screen, /getBackDestination\('readingActivity'\)/);
  assert.match(setup, /getBackDestination\('readingSetup'\)/);
  assert.match(hook, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(hook, /return true;/);
});

test('erros HTTP comuns do Reading ficam locais e não são convertidos em logout', async () => {
  for (const status of [400, 403, 404, 500]) {
    const reading = loadReadingService(async () => ({ ok: false, status }));
    await assert.rejects(reading.getReadingActivities(), (error) => error.name === 'ReadingRequestError' && error.status === status);
  }
});

test('falha de rede do Reading fica local, enquanto sessão inválida segue o fluxo global', async () => {
  const network = loadReadingService(async () => { throw new Error('connection'); });
  await assert.rejects(network.getReadingActivities(), (error) => error.name === 'ReadingRequestError' && error.kind === 'network');

  const invalidSession = loadReadingService(async () => { throw new TestSessionError('invalid'); });
  await assert.rejects(invalidSession.getReadingActivities(), (error) => error instanceof TestSessionError && error.kind === 'invalid');
});

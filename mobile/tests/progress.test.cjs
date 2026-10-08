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
  const context = vm.createContext({ URL });
  const execute = vm.runInContext(`(function(require, module, exports) {${output}\n})`, context, { filename: file });
  execute((request) => {
    if (Object.prototype.hasOwnProperty.call(dependencies, request)) return dependencies[request];
    throw new Error(`Unexpected runtime import: ${request}`);
  }, module, module.exports);
  return module.exports;
}

function dailyGoal(date, values = [false, false, false]) {
  const completed = values.filter(Boolean).length;
  return {
    date,
    completed,
    total: 3,
    vocabulary: { completed: values[0] },
    conversation: { completed: values[1] },
    reading: { completed: values[2] },
    goalCompleted: completed === 3,
  };
}

const week = [
  dailyGoal('2026-09-28', [true, true, true]),
  dailyGoal('2026-09-29', [true, false, true]),
  dailyGoal('2026-09-30'),
  dailyGoal('2026-10-01', [true, true, true]),
  dailyGoal('2026-10-02'),
  dailyGoal('2026-10-03'),
  dailyGoal('2026-10-04'),
];

const dashboard = {
  period: 'ALL_TIME',
  periodStart: null,
  periodEnd: '2026-10-01T18:00:00Z',
  overview: {
    conversationsCompleted: 5,
    readingsCompleted: 4,
    wordsFirstSeen: 18,
    wordsMasteredCurrent: 3,
  },
  conversation: {
    totalEvaluated: 5,
    successCount: 3,
    needsPracticeCount: 2,
    successRate: 60,
    averageOverall: 72.5,
    averageCommunication: 76,
    averageGrammar: 68,
    averageVocabulary: 73,
    averageFluency: 70,
    averageRelevance: 75,
    byDifficulty: [{
      difficulty: 'INTERMEDIATE', count: 5, successCount: 3, averageOverall: 72.5,
      averageCommunication: 76, averageGrammar: 68, averageVocabulary: 73, averageFluency: 70,
      averageRelevance: 75,
    }],
  },
  reading: {
    totalCompleted: 4,
    successCount: 3,
    needsPracticeCount: 1,
    successRate: 75,
    averageComprehension: 81,
    byDifficulty: [{ difficulty: 'BEGINNER', count: 4, successCount: 3, averageComprehension: 81 }],
  },
  vocabulary: {
    totalWords: 18,
    newCount: 7,
    reviewingCount: 5,
    learnedCount: 3,
    masteredCount: 3,
    dueForReview: 4,
    wordsFirstSeenInPeriod: 18,
    wordsReviewedInPeriod: 9,
  },
  comparison: null,
  dailyGoal: week[3],
  weeklyGoals: {
    weekStart: '2026-09-28',
    weekEnd: '2026-10-04',
    completedDays: 2,
    totalDays: 7,
    days: week,
  },
};

const timeline = {
  points: [
    { period: '2026-08', conversation: { count: 2, average: 65 }, reading: { count: 1, average: 70 }, vocabulary: { wordsFirstSeen: 8 } },
    { period: '2026-09', conversation: { count: 3, average: 78 }, reading: { count: 3, average: 84 }, vocabulary: { wordsFirstSeen: 10 } },
  ],
};

function loadService(authenticatedFetch = async () => ({ ok: false, status: 500 })) {
  return loadTypeScript('../src/features/progress/progress.service.ts', {
    '../../api/authenticated-fetch': { authenticatedFetch },
  });
}

const presentation = loadTypeScript('../src/features/progress/progress.presentation.ts');

test('parsing preserva semana, visão geral e métricas reais de cada área', () => {
  const { parseProgressDashboard } = loadService();
  const parsed = parseProgressDashboard(dashboard);

  assert.ok(parsed);
  assert.equal(parsed.weeklyGoals.days.length, 7);
  assert.equal(parsed.weeklyGoals.completedDays, 2);
  assert.equal(parsed.weeklyGoals.days[0].goalCompleted, true);
  assert.equal(parsed.weeklyGoals.days[1].goalCompleted, false);
  assert.equal(parsed.overview.wordsFirstSeen, 18);
  assert.equal(parsed.conversation.averageGrammar, 68);
  assert.equal(parsed.conversation.averageRelevance, 75);
  assert.equal(parsed.reading.averageComprehension, 81);
  assert.equal(parsed.vocabulary.learnedCount, 3);
});

test('contrato rejeita semana incompleta ou estado de vocabulário ausente', () => {
  const { parseProgressDashboard } = loadService();
  assert.equal(parseProgressDashboard({ ...dashboard, weeklyGoals: { ...dashboard.weeklyGoals, days: week.slice(0, 6) } }), null);
  const { learnedCount, ...withoutLearned } = dashboard.vocabulary;
  assert.equal(parseProgressDashboard({ ...dashboard, vocabulary: withoutLearned }), null);
  assert.equal(learnedCount, 3);
});

test('timeline mantém evolução de atividades e notas sem fabricar pontos', () => {
  const { parseProgressTimeline } = loadService();
  const parsed = parseProgressTimeline(timeline);
  assert.ok(parsed);
  assert.equal(parsed.points.length, 2);
  assert.equal(parsed.points[0].vocabulary.wordsFirstSeen, 8);
  assert.equal(presentation.hasActivityEvolution(parsed.points), true);
  assert.equal(presentation.hasPerformanceEvolution(parsed.points), true);
  assert.equal(presentation.hasActivityEvolution([]), false);
  assert.equal(presentation.hasPerformanceEvolution([parsed.points[0]]), false);
  assert.equal(presentation.formatProgressScore(null), 'Sem dados');
});

test('distribuição de vocabulário usa NEW, REVIEWING, LEARNED e MASTERED', () => {
  const distribution = presentation.getVocabularyDistribution(dashboard.vocabulary);
  assert.equal(distribution.map(({ key }) => key).join(','), 'new,reviewing,learned,mastered');
  assert.equal(distribution.map(({ value }) => value).join(','), '7,5,3,3');
});

test('serviço usa os endpoints e o período reais do Progress', async () => {
  const calls = [];
  const service = loadService(async (requestPath) => {
    calls.push(requestPath);
    const body = requestPath === '/api/v1/progress/timeline' ? timeline : { ...dashboard, period: 'LAST_30_DAYS', periodStart: '2026-09-02T18:00:00Z' };
    return { ok: true, status: 200, json: async () => body };
  });

  const result = await service.getProgressDashboard('LAST_30_DAYS');
  const history = await service.getProgressTimeline();
  assert.equal(result.period, 'LAST_30_DAYS');
  assert.equal(history.points.length, 2);
  assert.equal(calls.join(','), '/api/v1/progress?period=LAST_30_DAYS,/api/v1/progress/timeline');
});

test('tela mantém ordem, refresh por foco e estados total, parcial e vazio', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/features/progress/screens/ProgressPlaceholderScreen.tsx'), 'utf8');
  const weekly = source.indexOf('Metas diárias da semana');
  const overview = source.indexOf('Visão geral');
  const evolution = source.indexOf('title="Evolução"');
  const performance = source.indexOf('title="Desempenho"');
  const vocabulary = source.indexOf('title="Vocabulário"');
  const conversation = source.indexOf('title="Conversação"');
  const reading = source.indexOf('title="Leitura"');

  assert.ok(weekly < overview && overview < evolution && evolution < performance);
  assert.ok(performance < vocabulary && vocabulary < conversation && conversation < reading);
  assert.match(source, /useFocusEffect/);
  assert.match(source, /RefreshControl/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /timelineError/);
  assert.match(source, /state\.error && \(!data \|\| !state\.timeline\)/);
  assert.match(source, /totalEvaluated === 0/);
  assert.match(source, /totalCompleted === 0/);
  assert.match(source, /vocabulary\.totalWords === 0|VocabularyDistributionChart/);
});

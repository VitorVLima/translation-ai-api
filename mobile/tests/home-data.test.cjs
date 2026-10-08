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
  class TestFormData {
    constructor() { this.entries = []; }
    append(name, value) { this.entries.push([name, value]); }
  }
  const context = vm.createContext({ URL, FormData: TestFormData });
  const execute = vm.runInContext(`(function(require, module, exports) {${output}\n})`, context, { filename: file });
  execute((request) => {
    if (Object.prototype.hasOwnProperty.call(dependencies, request)) return dependencies[request];
    throw new Error(`Unexpected runtime import: ${request}`);
  }, module, module.exports);
  return module.exports;
}

const { getHomeProfilePresentation } = loadTypeScript('../src/features/profile/profile.presentation.ts', { '../../i18n/translate': require('./i18n-helper.cjs') });
const { getDailyGoalMessage, getHomeVocabularyState } = loadTypeScript('../src/features/home/home.presentation.ts', { '../../i18n/translate': require('./i18n-helper.cjs') });
const { parseProgressData } = loadTypeScript('../src/features/progress/progress.service.ts', {
  '../../api/authenticated-fetch': { authenticatedFetch: async () => ({ ok: false }) },
});
const { getBackDestination } = loadTypeScript('../src/navigation/back-destinations.ts');
const {
  getDailyVocabularyPresentation,
  getVocabularyStudyNavigation,
  getVocabularyStudyProgress,
} = loadTypeScript('../src/features/vocabulary/vocabulary.presentation.ts', { '../../i18n/translate': require('./i18n-helper.cjs') });
const { parseDailyVocabularyLesson } = loadTypeScript('../src/features/vocabulary/vocabulary.service.ts', {
  '../../api/authenticated-fetch': { authenticatedFetch: async () => ({ ok: false }) },
});
const {
  appendDictationToDraft,
  buildCreateConversationRequest,
  CONVERSATION_DIFFICULTY_OPTIONS,
  CONVERSATION_MODE_OPTIONS,
  DEFAULT_CONVERSATION_MODE,
  canSendConversationMessage,
  getConversationEvaluationProgress,
  getEvaluationProgressCopy,
  getEvaluationScorePresentation,
  getEvaluationStatusPresentation,
  getInsufficientEvaluationMessage,
  getConversationCreateErrorMessage,
  getConversationListItemPresentation,
  getNewAssistantMessage,
  getUserCorrection,
  getConversationScenarioPresentation,
  getHomeConversationPresentation,
  groupConversations,
  mostRecentActiveConversation,
  normalizeConversationMessage,
  recommendedConversationDifficulty,
} = loadTypeScript('../src/features/conversations/conversations.presentation.ts');
function loadConversationService(authenticatedFetch) {
  return loadTypeScript('../src/features/conversations/conversations.service.ts', {
    '../../api/authenticated-fetch': { authenticatedFetch },
  });
}

function loadConversationAudioService(authenticatedFetch) {
  return loadTypeScript('../src/features/conversations/conversation-audio.service.ts', {
    '../../api/authenticated-fetch': { authenticatedFetch },
    'expo-file-system': { File: class { constructor() { this.exists = true; this.size = 1; } delete() {} slice() { return this; } } },
  });
}

function loadProfileService(authenticatedFetch) {
  return loadTypeScript('../src/features/profile/profile.service.ts', {
    '../../api/authenticated-fetch': { authenticatedFetch },
  });
}

const {
  isConversationDetail,
  isConversationEvaluation,
  isConversationMessage,
  isSendConversationMessageResponse,
} = loadConversationService(async () => { throw new Error('not used'); });

const user = { username: 'Nome de usuário' };
const baseProfile = {
  preferredName: 'Nome preferido',
  birthDate: '2000-01-01',
  age: 26,
  englishLevel: 'B1',
  learningGoal: 'GENERAL',
  avatarType: 'PREDEFINED',
  avatarKey: 'avatar_1',
  onboardingCompleted: false,
  onboardingStatus: 'PENDING',
  initialSetupCompleted: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

test('main and conversation back destinations follow the screen hierarchy', () => {
  assert.equal(getBackDestination('practice'), '/');
  assert.equal(getBackDestination('conversations'), '/');
  assert.equal(getBackDestination('progress'), '/');
  assert.equal(getBackDestination('profile'), '/');
  assert.equal(getBackDestination('newConversation'), '/conversations');
  assert.equal(getBackDestination('conversation'), '/conversations');
});

test('Android back prevents Stack pop before using the deterministic destination', () => {
  const hookSource = fs.readFileSync(path.resolve(__dirname, '../src/hooks/use-deterministic-back.ts'), 'utf8');
  const tabsSource = fs.readFileSync(path.resolve(__dirname, '../app/(app)/_layout.tsx'), 'utf8');
  assert.match(hookSource, /navigation\.addListener\('beforeRemove'/);
  assert.match(hookSource, /event\.preventDefault\(\)/);
  assert.match(hookSource, /event\.data\.action\.type !== 'GO_BACK'/);
  assert.match(tabsSource, /backBehavior="initialRoute"/);
});

test('shared header reserves the visual center and avatar choices have no visible name', () => {
  const headerSource = fs.readFileSync(path.resolve(__dirname, '../src/components/ScreenHeader.tsx'), 'utf8');
  const profileSource = fs.readFileSync(path.resolve(__dirname, '../src/features/profile/screens/ProfileScreen.tsx'), 'utf8');
  const conversationsSource = fs.readFileSync(path.resolve(__dirname, '../src/features/conversations/screens/ConversationsScreen.tsx'), 'utf8');
  const practiceSource = fs.readFileSync(path.resolve(__dirname, '../src/features/practice/screens/PracticeScreen.tsx'), 'utf8');
  const progressSource = fs.readFileSync(path.resolve(__dirname, '../src/features/progress/screens/ProgressPlaceholderScreen.tsx'), 'utf8');
  assert.match(headerSource, /textAlign: 'center'/);
  assert.match(headerSource, /position: 'absolute'/);
  assert.match(profileSource, /avatar\.key === 'avatar_default' \? t\('profile.defaultAvatar'\)/);
  assert.doesNotMatch(profileSource, /avatarChoiceLabel/);
  assert.match(profileSource, /ScreenHeader onBack=\{goHome\} title=\{t\('profile.title'\)\}/);
  assert.match(conversationsSource, /ScreenHeader onBack={goHome} title="Conversas"/);
  assert.match(practiceSource, /<ScreenHeader onBack=\{goHome\} title="Praticar"/);
  assert.match(progressSource, /title="Meu progresso"/);
});

test('Praticar mantém os quatro cards na ordem do produto e sem Conversas', () => {
  const practiceSource = fs.readFileSync(path.resolve(__dirname, '../src/features/practice/screens/PracticeScreen.tsx'), 'utf8');
  const vocabulary = practiceSource.indexOf("title: 'Vocabulário'");
  const reading = practiceSource.indexOf("title: 'Leitura'");
  const translator = practiceSource.indexOf("title: 'Tradutor'");
  const correction = practiceSource.indexOf("title: 'Correção'");

  assert.ok(vocabulary >= 0 && vocabulary < reading && reading < translator && translator < correction);
  assert.doesNotMatch(practiceSource, /title: 'Conversas'/);
  assert.match(practiceSource, /destination: '\/practice\/vocabulary'/);
  assert.match(practiceSource, /destination: '\/practice\/reading'/);
  assert.match(practiceSource, /destination: '\/practice\/translator'/);
  assert.match(practiceSource, /destination: '\/practice\/correction'/);
});

test('as cinco telas principais oferecem pull-to-refresh', () => {
  const screenPaths = [
    '../src/features/home/screens/HomeScreen.tsx',
    '../src/features/practice/screens/PracticeScreen.tsx',
    '../src/features/conversations/screens/ConversationsScreen.tsx',
    '../src/features/progress/screens/ProgressPlaceholderScreen.tsx',
    '../src/features/profile/screens/ProfileScreen.tsx',
  ];

  for (const screenPath of screenPaths) {
    assert.match(fs.readFileSync(path.resolve(__dirname, screenPath), 'utf8'), /RefreshControl/);
  }
});

test('profile editing preserves the contract and avatar uses a separate endpoint', async () => {
  const calls = [];
  const responseProfile = { ...baseProfile, preferredName: 'New name', avatarKey: 'avatar_2' };
  const service = loadProfileService(async (path, options) => {
    calls.push({ path, options });
    return new Response(JSON.stringify(responseProfile), { status: 200 });
  });

  await service.updateProfile({
    preferredName: 'New name',
    birthDate: '2000-01-01',
    englishLevel: 'B2',
    learningGoal: 'WORK',
  });
  await service.setPredefinedAvatar('avatar_2');

  assert.equal(calls[0].path, '/api/v1/users/me/profile');
  assert.equal(calls[0].options.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    preferredName: 'New name',
    birthDate: '2000-01-01',
    englishLevel: 'B2',
    learningGoal: 'WORK',
  });
  assert.equal(calls[1].path, '/api/v1/users/me/profile/avatar/predefined');
  assert.deepEqual(JSON.parse(calls[1].options.body), { avatarKey: 'avatar_2' });
});

test('profile save failure rejects the response', async () => {
  const service = loadProfileService(async () => new Response(null, { status: 422 }));
  await assert.rejects(
    service.updateProfile({ preferredName: null, birthDate: null, englishLevel: null, learningGoal: null }),
  );
});

test('perfil pendente usa nome preferido, nível real, avatar e exibe conclusão', () => {
  const result = getHomeProfilePresentation(
    user,
    baseProfile,
    [{ key: 'avatar_1', displayName: 'Avatar 1', imageUrl: '/api/v1/avatars/avatar_1/image' }],
    'https://api.example.test',
  );
  assert.equal(result.firstName, 'Nome');
  assert.equal(result.levelLabel, 'B1 · Intermediário');
  assert.equal(result.avatarImageUrl, 'https://api.example.test/api/v1/avatars/avatar_1/image');
  assert.equal(result.showCompletion, true);
});

test('perfil completo não exibe conclusão; ausência de nível tem fallback', () => {
  const result = getHomeProfilePresentation(
    user,
    { ...baseProfile, preferredName: null, englishLevel: null, onboardingCompleted: true, onboardingStatus: 'COMPLETED' },
    [],
    'https://api.example.test',
  );
  assert.equal(result.firstName, 'Nome');
  assert.equal(result.levelLabel, 'Não informado');
  assert.equal(result.showCompletion, false);
  assert.equal(
    getHomeProfilePresentation(
      user,
      { ...baseProfile, onboardingStatus: 'DISMISSED' },
      [],
      'https://api.example.test',
    ).showCompletion,
    false,
  );
});

function conversation(overrides = {}) {
  return {
    id: 'conversation-1',
    scenario: 'FREE_TALK',
    language: 'en',
    difficulty: 'INTERMEDIATE',
    interactionMode: 'TEXT',
    title: 'Conversa livre',
    scenarioDisplayName: 'Conversa livre',
    description: 'Converse sobre qualquer assunto.',
    assistantDisplayName: 'Tutor',
    assistantAvatarKey: 'assistant_1',
    assistantAvatarImageUrl: '/api/v1/avatars/assistant_1/image',
    createdAt: '2026-09-20T12:00:00Z',
    updatedAt: '2026-09-20T12:00:00Z',
    endedAt: null,
    ...overrides,
  };
}

test('múltiplas conversas pendentes escolhem a atualização mais recente', () => {
  const older = conversation({ id: 'older', updatedAt: '2026-09-20T12:00:00Z' });
  const completed = conversation({ id: 'completed', updatedAt: '2026-09-29T12:00:00Z', endedAt: '2026-09-29T12:00:00Z' });
  const newer = conversation({ id: 'newer', updatedAt: '2026-09-28T12:00:00Z' });
  assert.equal(mostRecentActiveConversation([older, completed, newer]).id, 'newer');

  const result = getHomeConversationPresentation([older, completed, newer], 'https://api.example.test');
  assert.equal(result.kind, 'continue');
  assert.equal(result.conversation.id, 'newer');
  assert.equal(result.difficultyLabel, 'Intermediário');
  assert.equal(result.avatarImageUrl, 'https://api.example.test/api/v1/avatars/assistant_1/image');
});

test('histórico sem conversa pendente oferece nova conversa', () => {
  const result = getHomeConversationPresentation([
    conversation({ endedAt: '2026-09-21T12:00:00Z' }),
  ], 'https://api.example.test');
  assert.equal(result.kind, 'new');
  assert.equal(result.hasHistory, true);
  assert.equal(result.title, 'Pronto para praticar?');
  assert.equal(result.actionLabel, 'Nova conversa');
});

test('usuário sem qualquer conversa recebe CTA da primeira conversa', () => {
  const result = getHomeConversationPresentation([], 'https://api.example.test');
  assert.equal(result.kind, 'new');
  assert.equal(result.hasHistory, false);
  assert.equal(result.title, 'Comece sua primeira conversa');
  assert.equal(result.actionLabel, 'Criar conversa');
});

test('nenhuma conversa produz grupos vazios', () => {
  const groups = groupConversations([]);
  assert.equal(groups.active.length, 0);
  assert.equal(groups.completed.length, 0);
});

test('conversas ativas são ordenadas pela atualização mais recente', () => {
  const groups = groupConversations([
    conversation({ id: 'older-active', updatedAt: '2026-09-20T12:00:00Z' }),
    conversation({ id: 'newer-active', updatedAt: '2026-09-28T12:00:00Z' }),
  ]);
  assert.equal(groups.active.map(({ id }) => id).join(','), 'newer-active,older-active');
  assert.equal(groups.completed.length, 0);
});

test('conversas concluídas são ordenadas pela conclusão mais recente', () => {
  const groups = groupConversations([
    conversation({ id: 'older-completed', endedAt: '2026-09-21T12:00:00Z' }),
    conversation({ id: 'newer-completed', endedAt: '2026-09-29T12:00:00Z' }),
  ]);
  assert.equal(groups.active.length, 0);
  assert.equal(groups.completed.map(({ id }) => id).join(','), 'newer-completed,older-completed');
});

test('mistura de conversas separa estados sem perder itens', () => {
  const groups = groupConversations([
    conversation({ id: 'active' }),
    conversation({ id: 'completed', endedAt: '2026-09-29T12:00:00Z' }),
  ]);
  assert.equal(groups.active.map(({ id }) => id).join(','), 'active');
  assert.equal(groups.completed.map(({ id }) => id).join(','), 'completed');
});

test('timestamps inválidos ficam por último e mantêm ordem estável entre si', () => {
  const groups = groupConversations([
    conversation({ id: 'invalid-a', updatedAt: 'invalid' }),
    conversation({ id: 'valid', updatedAt: '2026-09-29T12:00:00Z' }),
    conversation({ id: 'invalid-b', updatedAt: '' }),
  ]);
  assert.equal(groups.active.map(({ id }) => id).join(','), 'valid,invalid-a,invalid-b');
});

test('apresentação da lista usa fallback seguro para campos visuais ausentes', () => {
  const active = getConversationListItemPresentation(
    conversation({ assistantDisplayName: '', assistantAvatarImageUrl: '', updatedAt: 'invalid' }),
    'https://api.example.test',
  );
  assert.equal(active.completed, false);
  assert.equal(active.assistantDisplayName, '');
  assert.equal(active.avatarImageUrl, null);
  assert.equal(active.dateLabel, '');
  assert.equal(active.interactionModeLabel, 'Texto');

  const completed = getConversationListItemPresentation(
    conversation({ endedAt: '2026-09-29T12:00:00Z' }),
    'https://api.example.test',
  );
  assert.equal(completed.completed, true);
  assert.match(completed.dateLabel, /^Concluída em /);
});

test('todas as dificuldades do contrato possuem apresentação válida', () => {
  assert.equal(
    CONVERSATION_DIFFICULTY_OPTIONS.map(({ value }) => value).join(','),
    'BEGINNER,INTERMEDIATE,ADVANCED',
  );
  for (const option of CONVERSATION_DIFFICULTY_OPTIONS) {
    assert.ok(option.label.trim());
    assert.ok(option.cefr.trim());
    assert.ok(option.description.trim());
  }
});

test('modos visuais deixam texto disponível e voz marcada como futura', () => {
  assert.equal(DEFAULT_CONVERSATION_MODE, 'TEXT');
  assert.equal(
    CONVERSATION_MODE_OPTIONS.map(({ value }) => value).join(','),
    'TEXT,VOICE',
  );
  assert.equal(CONVERSATION_MODE_OPTIONS.find(({ value }) => value === 'TEXT').available, true);
  assert.equal(CONVERSATION_MODE_OPTIONS.find(({ value }) => value === 'VOICE').available, true);
});

test('detalhe validado conserva modo persistido e rejeita modo inválido', () => {
  const id = '9aa4feaa-b845-4e5b-886f-bda68dd93111';
  assert.equal(isConversationDetail({ conversation: conversation({ id, interactionMode: 'VOICE' }), messages: [], evaluation: null }), true);
  assert.equal(isConversationDetail({ conversation: conversation({ id, interactionMode: 'INVALID' }), messages: [], evaluation: null }), false);
});

test('seleciona somente a nova resposta da IA para TTS', () => {
  const oldAssistant = message('ASSISTANT', 'Old reply', '1aa4feaa-b845-4e5b-886f-bda68dd93111');
  const newUser = message('USER', 'New message', '2aa4feaa-b845-4e5b-886f-bda68dd93111');
  const newAssistant = message('ASSISTANT', 'New reply', '3aa4feaa-b845-4e5b-886f-bda68dd93111');
  assert.equal(getNewAssistantMessage(new Set([oldAssistant.id]), [oldAssistant, newUser, newAssistant])?.id, newAssistant.id);
  assert.equal(getNewAssistantMessage(new Set([oldAssistant.id, newAssistant.id]), [oldAssistant, newUser, newAssistant]), null);
});

test('correção pertence à mensagem USER anterior, sem substituir seu texto', () => {
  const original = message('USER', 'I go yesterday', '9aa4feaa-b845-4e5b-886f-bda68dd93113');
  const reply = { ...message('ASSISTANT', 'What did you do?', '9aa4feaa-b845-4e5b-886f-bda68dd93114'), correctedText: 'I went yesterday' };
  assert.equal(getUserCorrection([original, reply], 0), 'I went yesterday');
  assert.equal(getUserCorrection([original, reply], 1), null);
  assert.equal(getUserCorrection([original, { ...reply, correctedText: original.content }], 0), null);
});

test('ditado em TEXT atualiza o draft sem criar mensagem e preserva texto existente', () => {
  assert.equal(appendDictationToDraft('', '  Hello there  '), 'Hello there');
  assert.equal(appendDictationToDraft('Good morning', ' how are you? '), 'Good morning how are you?');
  assert.throws(() => appendDictationToDraft('Draft', '   '), /empty-transcription/);
  assert.throws(() => appendDictationToDraft('x'.repeat(4999), 'more'), /message-too-long/);
});

test('tradução usa o endpoint real e mantém a resposta vinculável à mensagem solicitada', async () => {
  const calls = [];
  const service = loadTypeScript('../src/features/conversations/conversation-translation.service.ts', {
    '../../api/authenticated-fetch': { authenticatedFetch: async (path, options) => {
      calls.push({ path, options });
      return { ok: true, json: async () => ({ translation: 'Como foi seu dia?', enrichment: null }) };
    } },
  });
  const result = await service.translateAssistantMessage('How was your day?');
  assert.equal(result, 'Como foi seu dia?');
  assert.equal(calls[0].path, '/api/v1/translate');
  assert.deepEqual(JSON.parse(calls[0].options.body), { text: 'How was your day?', sourceLanguage: 'en', targetLanguage: 'pt' });
});

test('serviÃ§os de voz usam os contratos protegidos de STT e TTS', async () => {
  const calls = [];
  const service = loadConversationAudioService(async (path, options) => {
    calls.push({ path, options });
    if (path === '/api/v1/transcriptions') {
      return { ok: true, status: 200, json: async () => ({ text: 'Hello', language: 'en' }) };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'audio/wav' },
      arrayBuffer: async () => new Uint8Array([82, 73, 70, 70]).buffer,
    };
  });

  const transcription = await service.transcribeConversationAudio({ uri: 'file:///cache/recording.m4a', name: 'recording.m4a', mimeType: 'audio/mp4' });
  const wav = await service.synthesizeConversationSpeech('9aa4feaa-b845-4e5b-886f-bda68dd93111', 'Hello');

  assert.deepEqual({ ...transcription }, { text: 'Hello', language: 'en' });
  assert.equal(calls[0].path, '/api/v1/transcriptions');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(calls[0].options.body.entries.map(([name]) => name), ['file', 'language']);
  assert.equal(calls[0].options.body.entries[1][1], 'en');
  assert.equal(calls[1].path, '/api/v1/speech');
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    conversationId: '9aa4feaa-b845-4e5b-886f-bda68dd93111', language: 'en', text: 'Hello',
  });
  assert.equal(wav.byteLength, 4);
});

test('TTS accepts audio/wav Content-Type parameters', async () => {
  const service = loadConversationAudioService(async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'audio/wav; charset=binary' },
    arrayBuffer: async () => new Uint8Array([82, 73, 70, 70]).buffer,
  }));

  const wav = await service.synthesizeConversationSpeech(
    '9aa4feaa-b845-4e5b-886f-bda68dd93111',
    'Hello',
  );
  assert.equal(wav.byteLength, 4);
});

test('TTS rejects an empty response body', async () => {
  const service = loadConversationAudioService(async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'audio/wav' },
    arrayBuffer: async () => new ArrayBuffer(0),
  }));

  await assert.rejects(
    service.synthesizeConversationSpeech('9aa4feaa-b845-4e5b-886f-bda68dd93111', 'Hello'),
    (error) => error.operation === 'speech' && error.kind === 'invalid-response',
  );
});

test('nível real recomenda dificuldade sem impedir alteração pelo usuário', () => {
  assert.equal(recommendedConversationDifficulty('A1'), 'BEGINNER');
  assert.equal(recommendedConversationDifficulty('A2'), 'BEGINNER');
  assert.equal(recommendedConversationDifficulty('B1'), 'INTERMEDIATE');
  assert.equal(recommendedConversationDifficulty('B2'), 'INTERMEDIATE');
  assert.equal(recommendedConversationDifficulty('C1'), 'ADVANCED');
  assert.equal(recommendedConversationDifficulty('C2'), 'ADVANCED');
  assert.equal(recommendedConversationDifficulty(null), 'INTERMEDIATE');
});

test('request de criação preserva cenário e dificuldade e fixa inglês', () => {
  assert.deepEqual(
    { ...buildCreateConversationRequest('JOB_INTERVIEW', 'ADVANCED') },
    { scenario: 'JOB_INTERVIEW', language: 'en', difficulty: 'ADVANCED', interactionMode: 'TEXT' },
  );
  assert.equal(buildCreateConversationRequest('JOB_INTERVIEW', 'ADVANCED', 'VOICE').interactionMode, 'VOICE');
  assert.throws(() => buildCreateConversationRequest('JOB_INTERVIEW', 'ADVANCED', 'INVALID'), /invalid-mode/);
  assert.throws(() => buildCreateConversationRequest('airport', 'BEGINNER'), /invalid-scenario/);
  assert.throws(() => buildCreateConversationRequest('TRAVEL', 'UNKNOWN'), /invalid-difficulty/);
});

test('mensagem textual remove espaços externos, rejeita vazio e respeita limite', () => {
  assert.equal(normalizeConversationMessage('  Hello there!  '), 'Hello there!');
  assert.equal(normalizeConversationMessage('   \n  '), null);
  assert.equal(normalizeConversationMessage('x'.repeat(5000)).length, 5000);
  assert.throws(() => normalizeConversationMessage('x'.repeat(5001)), /message-too-long/);
});

test('detalhe real aceita USER e ASSISTANT e preserva a ordem recebida', () => {
  const summary = conversation({ id: '9aa4feaa-b845-4e5b-886f-bda68dd93111' });
  const messages = [
    {
      id: '9aa4feaa-b845-4e5b-886f-bda68dd93112',
      role: 'ASSISTANT',
      content: 'How can I help you?',
      correctedText: null,
      createdAt: '2026-09-20T12:00:00Z',
    },
    {
      id: '9aa4feaa-b845-4e5b-886f-bda68dd93113',
      role: 'USER',
      content: 'I want to practice.',
      correctedText: null,
      createdAt: '2026-09-20T12:01:00Z',
    },
  ];
  const detail = { conversation: summary, messages, evaluation: null };
  assert.equal(isConversationDetail(detail), true);
  assert.equal(detail.messages.map(({ role }) => role).join(','), 'ASSISTANT,USER');
  assert.equal(isConversationMessage({ ...messages[0], role: 'SYSTEM' }), false);
  assert.equal(isConversationDetail({ conversation: summary, messages: [...messages].reverse() }), false);
});

test('response síncrono de mensagem valida reply e correção opcional', () => {
  assert.equal(isSendConversationMessageResponse({ reply: 'Great!', hasCorrection: false, correctedText: null }), true);
  assert.equal(isSendConversationMessageResponse({ reply: 'Try this.', hasCorrection: true, correctedText: 'I went yesterday.' }), true);
  assert.equal(isSendConversationMessageResponse({ reply: '', hasCorrection: false, correctedText: null }), false);
  assert.equal(isSendConversationMessageResponse({ reply: 'Try this.', hasCorrection: true, correctedText: null }), false);
});

test('service envia o DTO textual exato e interpreta a resposta síncrona', async () => {
  const calls = [];
  const service = loadConversationService(async (requestPath, options) => {
    calls.push({ requestPath, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ reply: 'Nice to meet you!', hasCorrection: false, correctedText: null }),
    };
  });
  const id = '9aa4feaa-b845-4e5b-886f-bda68dd93111';
  const response = await service.sendConversationMessage(id, 'Nice to meet you.');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].requestPath, `/api/v1/conversations/${id}/messages`);
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), { message: 'Nice to meet you.' });
  assert.equal(response.reply, 'Nice to meet you!');
});

test('service carrega o detalhe com histórico persistido', async () => {
  const id = '9aa4feaa-b845-4e5b-886f-bda68dd93111';
  const detail = {
    conversation: conversation({ id }),
    messages: [{
      id: '9aa4feaa-b845-4e5b-886f-bda68dd93112',
      role: 'ASSISTANT',
      content: 'Welcome!',
      correctedText: null,
      createdAt: '2026-09-20T12:00:00Z',
    }],
    evaluation: null,
  };
  const service = loadConversationService(async (requestPath, options) => {
    assert.equal(requestPath, `/api/v1/conversations/${id}`);
    assert.equal(options.signal, undefined);
    return { ok: true, status: 200, json: async () => detail };
  });
  const result = await service.getConversation(id);
  assert.equal(result.conversation.id, id);
  assert.equal(result.messages[0].role, 'ASSISTANT');
  assert.equal(result.messages[0].content, 'Welcome!');
});

test('POST de mensagem com falha não possui retry automático', async () => {
  let calls = 0;
  const service = loadConversationService(async () => {
    calls += 1;
    return { ok: false, status: 503 };
  });
  await assert.rejects(
    service.sendConversationMessage('9aa4feaa-b845-4e5b-886f-bda68dd93111', 'Hello'),
    (error) => error.status === 503 && error.operation === 'message',
  );
  assert.equal(calls, 1);
});

test('exclusão de conversa ativa usa DELETE único no endpoint da conversa', async () => {
  const calls = [];
  const service = loadConversationService(async (requestPath, options) => {
    calls.push({ requestPath, options });
    return { ok: true, status: 204 };
  });
  const id = '9aa4feaa-b845-4e5b-886f-bda68dd93111';
  await service.deleteConversation(id);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].requestPath, `/api/v1/conversations/${id}`);
  assert.equal(calls[0].options.method, 'DELETE');
});

function message(role, content, id) {
  return {
    id: id || '9aa4feaa-b845-4e5b-886f-bda68dd93112',
    role,
    content,
    correctedText: null,
    createdAt: '2026-09-20T12:00:00Z',
  };
}

test('progresso de avaliação conta somente mensagens USER linguísticas e limita a apresentação em 5', () => {
  assert.deepEqual(
    { ...getConversationEvaluationProgress([]) },
    { current: 0, displayCurrent: 0, required: 5, ready: false },
  );
  assert.equal(getConversationEvaluationProgress([message('USER', 'Hello')]).displayCurrent, 1);
  assert.equal(getConversationEvaluationProgress([message('ASSISTANT', 'Hello')]).current, 0);
  assert.equal(getConversationEvaluationProgress([message('USER', '123?!')]).current, 0);
  const four = getConversationEvaluationProgress(Array.from({ length: 4 }, (_, index) => message('USER', `Message ${index}`, `9aa4feaa-b845-4e5b-886f-bda68dd93${String(index).padStart(2, '0')}`)));
  assert.equal(four.displayCurrent, 4);
  assert.equal(four.ready, false);
  const five = getConversationEvaluationProgress(Array.from({ length: 5 }, (_, index) => message('USER', `Message ${index}`, `9aa4feaa-b845-4e5b-886f-bda68dd94${String(index).padStart(2, '0')}`)));
  assert.equal(five.displayCurrent, 5);
  assert.equal(five.ready, true);
  const ready = getConversationEvaluationProgress(Array.from({ length: 7 }, (_, index) => message('USER', `Message ${index}`, `9aa4feaa-b845-4e5b-886f-bda68dd93${String(index).padStart(2, '0')}`)));
  assert.equal(ready.current, 7);
  assert.equal(ready.displayCurrent, 5);
  assert.equal(ready.ready, true);
});

test('avaliação insuficiente preserva os contadores retornados pelo Backend', () => {
  const insufficient = {
    conversationId: '9aa4feaa-b845-4e5b-886f-bda68dd93111',
    status: 'INSUFFICIENT',
    minimumUserMessages: 5,
    currentUserMessages: 4,
  };
  assert.equal(isConversationEvaluation(insufficient), true);
  const message = getInsufficientEvaluationMessage(insufficient);
  assert.match(message, /Continue conversando/);
  assert.doesNotMatch(message, /\d|faltam|mais \d/i);
});

test('copy do progresso não expõe contadores ou mensagens restantes', () => {
  const partial = getEvaluationProgressCopy(false);
  const complete = getEvaluationProgressCopy(true);
  assert.match(partial.detail, /Continue conversando/);
  assert.match(complete.detail, /Pronto para avaliação/);
  for (const value of [partial.detail, partial.accessibilityLabel, complete.detail, complete.accessibilityLabel]) {
    assert.doesNotMatch(value, /\d\s*\/\s*5|faltam|mais \d|de 5/i);
  }
});

test('lista usa o mesmo id de conversa para estados ativo e concluído', () => {
  const active = getConversationListItemPresentation(conversation({ endedAt: null }), 'https://api.example.test');
  const completed = getConversationListItemPresentation(conversation({ endedAt: '2026-09-29T12:00:00Z' }), 'https://api.example.test');
  assert.equal(active.id, completed.id);
  assert.equal(active.completed, false);
  assert.equal(completed.completed, true);
  assert.equal(completed.interactionModeLabel, 'Texto');
});

test('apresentação da lista usa o modo persistido da conversa', () => {
  const voice = getConversationListItemPresentation(
    conversation({ interactionMode: 'VOICE' }),
    'https://api.example.test',
  );
  assert.equal(voice.interactionModeLabel, 'Voz');
});

test('tela de Conversas usa o hero local e a descrição real da conversa', () => {
  const screenSource = fs.readFileSync(path.resolve(__dirname, '../src/features/conversations/screens/ConversationsScreen.tsx'), 'utf8');
  const heroSource = fs.readFileSync(path.resolve(__dirname, '../src/features/conversations/components/ConversationIntroHero.tsx'), 'utf8');
  const itemSource = fs.readFileSync(path.resolve(__dirname, '../src/features/conversations/components/ConversationListItem.tsx'), 'utf8');
  const presented = getConversationListItemPresentation(conversation(), 'https://api.example.test');

  assert.match(screenSource, /ConversationIntroHero/);
  assert.match(heroSource, /hero-conversa\.png/);
  assert.match(itemSource, /conversation\.description/);
  assert.equal(presented.description, 'Converse sobre qualquer assunto.');
});

test('status e scores de avaliação usam somente valores reais do contrato', () => {
  assert.equal(getEvaluationStatusPresentation('SUCCESS').title, 'Boa comunicação!');
  assert.equal(getEvaluationStatusPresentation('NEEDS_PRACTICE').title, 'Continue praticando');
  assert.equal(getEvaluationStatusPresentation('INSUFFICIENT').title, 'Ainda não há mensagens suficientes');
  assert.equal(
    JSON.stringify(getEvaluationScorePresentation({ communication: 76, grammar: 68, vocabulary: 81, fluency: 70, relevance: null, overall: 74 }).map(({ key, value }) => ({ key, value }))),
    JSON.stringify([{ key: 'communication', value: 76 }, { key: 'grammar', value: 68 }, { key: 'vocabulary', value: 81 }, { key: 'fluency', value: 70 }, { key: 'relevance', value: null }]),
  );
});

test('service conclui uma conversa com POST único e interpreta a avaliação real', async () => {
  const calls = [];
  const id = '9aa4feaa-b845-4e5b-886f-bda68dd93111';
  const evaluation = {
    conversationId: id,
    status: 'SUCCESS',
    scores: { communication: 76, grammar: 68, vocabulary: 81, fluency: 70, relevance: 72, overall: 73 },
    strengths: ['Boa clareza.'],
    improvements: ['Use mais conectores.'],
    evaluatedAt: '2026-09-20T12:10:00Z',
  };
  const service = loadConversationService(async (requestPath, options) => {
    calls.push({ requestPath, options });
    return { ok: true, status: 200, json: async () => evaluation };
  });
  const result = await service.completeConversation(id);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].requestPath, `/api/v1/conversations/${id}/complete`);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.body, undefined);
  assert.equal(result.status, 'SUCCESS');
});

test('falha de conclusão não recebe retry automático', async () => {
  let calls = 0;
  const service = loadConversationService(async () => {
    calls += 1;
    return { ok: false, status: 503 };
  });
  await assert.rejects(
    service.completeConversation('9aa4feaa-b845-4e5b-886f-bda68dd93111'),
    (error) => error.status === 503 && error.operation === 'complete',
  );
  assert.equal(calls, 1);
});

test('service cria com o DTO preparado e retorna o id real do Backend', async () => {
  const calls = [];
  const created = conversation({ id: '9aa4feaa-b845-4e5b-886f-bda68dd93111' });
  const service = loadConversationService(async (requestPath, options) => {
    calls.push({ requestPath, options });
    return { ok: true, status: 201, json: async () => created };
  });
  const request = buildCreateConversationRequest('JOB_INTERVIEW', 'ADVANCED');
  const response = await service.createConversation(request);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].requestPath, '/api/v1/conversations');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    scenario: 'JOB_INTERVIEW', language: 'en', difficulty: 'ADVANCED', interactionMode: 'TEXT',
  });
  assert.equal(response.id, created.id);
});

test('criação VOICE envia modo persistido sem alterar os outros campos do contrato', async () => {
  const calls = [];
  const service = loadConversationService(async (path, options) => {
    calls.push({ path, options });
    return { ok: true, status: 201, json: async () => conversation({ id: '9aa4feaa-b845-4e5b-886f-bda68dd93111', interactionMode: 'VOICE' }) };
  });
  const created = await service.createConversation(buildCreateConversationRequest('JOB_INTERVIEW', 'ADVANCED', 'VOICE'));
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].options.body).interactionMode, 'VOICE');
  assert.equal(JSON.parse(calls[0].options.body).language, 'en');
  assert.equal(created.interactionMode, 'VOICE');
});

test('409 de criação possui mensagem de limite e conversa concluída bloqueia envio', () => {
  assert.match(getConversationCreateErrorMessage(409, 'http'), /três conversas em andamento/);
  assert.equal(canSendConversationMessage(null), true);
  assert.equal(canSendConversationMessage('2026-09-29T12:00:00Z'), false);
});

test('cenários reais usam metadados do catálogo sem opções visuais fictícias', () => {
  const ids = ['FREE_TALK', 'JOB_INTERVIEW', 'FRIENDS', 'SELF_INTRODUCTION', 'RESTAURANT', 'TRAVEL'];
  const presentations = ids.map((id, index) => getConversationScenarioPresentation({
    id,
    displayName: `Cenário ${index + 1}`,
    description: `Descrição ${index + 1}`,
    assistantDisplayName: `Tutor ${index + 1}`,
    assistantAvatarKey: `assistant_${index + 1}`,
    assistantAvatarImageUrl: `/api/v1/avatars/assistant_${index + 1}/image`,
  }, 'https://api.example.test'));

  assert.equal(presentations.map(({ id }) => id).join(','), ids.join(','));
  assert.equal(presentations[0].displayName, 'Cenário 1');
  assert.equal(
    presentations[0].avatarImageUrl,
    'https://api.example.test/api/v1/avatars/assistant_1/image',
  );
});

test('catálogo dinâmico aceita cenário válido novo e trata avatar ausente', () => {
  const result = getConversationScenarioPresentation({
    id: 'CUSTOM_PRACTICE',
    displayName: 'Prática personalizada',
    description: 'Descrição fornecida pelo Backend.',
    assistantDisplayName: '',
    assistantAvatarKey: '',
    assistantAvatarImageUrl: '',
  }, 'https://api.example.test');
  assert.equal(result.id, 'CUSTOM_PRACTICE');
  assert.equal(result.avatarImageUrl, null);
});

test('lição diária disponível e concluída usam dados reais; ausência permanece segura', () => {
  const lesson = {
    id: 'lesson',
    date: '2026-09-29',
    englishLevel: 'B1',
    category: 'FOOD',
    words: Array.from({ length: 10 }, (_, index) => ({
      id: `word-${index}`,
      word: `word-${index}`,
      translation: `palavra-${index}`,
      status: 'NEW',
      review: false,
    })),
    completedAt: null,
  };
  const presentation = getDailyVocabularyPresentation(lesson);
  assert.equal(presentation.completed, false);
  assert.equal(presentation.marker, 'Lição disponível');
  assert.equal(presentation.detail, '10 palavras preparadas para hoje');
  assert.equal(getDailyVocabularyPresentation(null), null);
  assert.equal(getDailyVocabularyPresentation({ ...lesson, words: [] }), null);
  assert.equal(getDailyVocabularyPresentation({ ...lesson, completedAt: '2026-09-29T12:00:00Z' }).completed, true);
});

test('dailyGoal gera as mensagens corretas de 0/3 a 3/3 sem recalcular desempenho', () => {
  const goal = (vocabulary, conversation, reading) => ({
    date: '2026-10-01', completed: 0, total: 3,
    vocabulary: { completed: vocabulary }, conversation: { completed: conversation },
    reading: { completed: reading }, goalCompleted: vocabulary && conversation && reading,
  });
    assert.equal(getDailyGoalMessage(goal(false, false, false)), 'Comece sua pr\u00e1tica de hoje.');
    assert.equal(getDailyGoalMessage(goal(true, false, false)), 'Voc\u00ea concluiu 1 de 3 atividades de hoje.');
  assert.equal(getDailyGoalMessage(goal(true, true, false)), 'Falta apenas uma leitura para concluir sua meta de hoje.');
  assert.equal(getDailyGoalMessage(goal(true, false, true)), 'Falta apenas uma conversa para concluir sua meta de hoje.');
    assert.equal(getDailyGoalMessage(goal(false, true, true)), 'Falta apenas o vocabul\u00e1rio para concluir sua meta de hoje.');
    assert.equal(getDailyGoalMessage(goal(true, true, true)), 'Voc\u00ea completou vocabul\u00e1rio, leitura e conversa hoje.');
});

test('progress parser consome dailyGoal real e rejeita bloco ausente', () => {
  const body = {
    overview: { conversationsCompleted: 1, readingsCompleted: 1, wordsFirstSeen: 3, wordsMasteredCurrent: 0 },
    dailyGoal: {
      date: '2026-10-01', completed: 2, total: 3,
      vocabulary: { completed: true }, conversation: { completed: false }, reading: { completed: true }, goalCompleted: false,
    },
  };
  assert.deepEqual(JSON.parse(JSON.stringify(parseProgressData(body))), body);
  assert.equal(parseProgressData({ overview: body.overview }), null);
});

test('estado do vocabul�rio da Home usa somente conclus�o real da li��o', () => {
  const lesson = { progress: { quizCompleted: false, quizScore: null, writingCompleted: false, completedAt: null } };
  assert.equal(getHomeVocabularyState(lesson), 'not-started');
  assert.equal(getHomeVocabularyState({ ...lesson, progress: { ...lesson.progress, quizCompleted: true } }), 'in-progress');
  assert.equal(getHomeVocabularyState({ ...lesson, progress: { ...lesson.progress, completedAt: '2026-10-01T12:00:00Z' } }), 'completed');
});

test('Home coloca perfil, conversa, vocabul�rio, meta e atalhos reais na ordem pedida', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/features/home/screens/HomeScreen.tsx'), 'utf8');
  const profile = source.indexOf('<ProfileCompletionCard');
  const conversation = source.indexOf('<ConversationFocusCard');
  const vocabulary = source.indexOf('<HomeVocabularyCard');
  const goal = source.indexOf('<HomeDailyGoalCard');
  assert.ok(profile < conversation && conversation < vocabulary && vocabulary < goal);
  assert.ok(source.includes("router.push('/practice/translator')"));
  assert.ok(source.includes("router.push('/practice/correction')"));
  assert.ok(source.includes('Promise.allSettled'));
});

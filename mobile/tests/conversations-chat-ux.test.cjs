const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadTypeScript(relativePath, dependencies = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  const requireDependency = (name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
    return dependencies[name];
  };
  vm.runInNewContext(`(function(require, module, exports) {${compiled}\n})`, vm.createContext({ console: { info() {}, warn() {} }, URL }))(
    requireDependency, loaded, loaded.exports,
  );
  return loaded.exports;
}

function message(id, content, role = 'USER') {
  return { id, content, role, correctedText: null, createdAt: '2026-10-05T12:00:00Z' };
}

test('mensagem otimista aparece após o histórico e sai quando o Backend confirma o turno', () => {
  const { visibleConversationMessages } = loadTypeScript('../src/features/conversations/conversations.presentation.ts');
  const old = message('old', 'Hello');
  const optimistic = message('local-1', 'Hello');
  const knownIds = new Set(['old']);

  assert.deepEqual(Array.from(visibleConversationMessages([old], optimistic, knownIds), ({ id }) => id), ['old', 'local-1']);

  const persisted = [old, message('server-user', 'Hello'), message('server-assistant', 'Hi!', 'ASSISTANT')];
  assert.deepEqual(Array.from(visibleConversationMessages(persisted, optimistic, knownIds), ({ id }) => id),
    ['old', 'server-user', 'server-assistant']);
  assert.deepEqual(Array.from(visibleConversationMessages(persisted, null, null), ({ id }) => id),
    ['old', 'server-user', 'server-assistant']);
});

test('proximidade do fim usa o viewport real e preserva leitura de mensagens antigas', () => {
  const { isNearConversationEnd } = loadTypeScript('../src/features/conversations/conversation-scroll.ts');

  assert.equal(isNearConversationEnd(1600, 400, 1200), true);
  assert.equal(isNearConversationEnd(1600, 400, 1140), true);
  assert.equal(isNearConversationEnd(1600, 400, 900), false);
  assert.equal(isNearConversationEnd(1600, 200, 1140), false);
  assert.equal(isNearConversationEnd(300, 400, 0), true);
});

test('scroll inicial espera conteudo e viewport medidos', () => {
  const { isConversationLayoutReady } = loadTypeScript('../src/features/conversations/conversation-scroll.ts');

  assert.equal(isConversationLayoutReady(0, 400), false);
  assert.equal(isConversationLayoutReady(1600, 0), false);
  assert.equal(isConversationLayoutReady(1600, 400), true);
});

test('pin acompanha qualquer medida valida e apenas o scroll manual muda seu estado', () => {
  const { isAtConversationEnd, shouldKeepConversationAtBottom, updateConversationPin } = loadTypeScript('../src/features/conversations/conversation-scroll.ts');

  let pinned = true; // Entrada na conversa.
  assert.equal(shouldKeepConversationAtBottom(pinned, false, 1600, 0), false);
  assert.equal(shouldKeepConversationAtBottom(pinned, false, 1600, 600), true);
  assert.equal(isAtConversationEnd(1600, 600, 970), false); // Perto do fim ainda pode cortar as acoes.
  assert.equal(isAtConversationEnd(1600, 600, 1000), true);
  assert.equal(isAtConversationEnd(1600, 320, 1280), true);
  assert.equal(shouldKeepConversationAtBottom(pinned, false, 1600, 320), true); // Teclado abriu.
  assert.equal(shouldKeepConversationAtBottom(pinned, false, 1600, 600), true); // Teclado fechou.

  pinned = updateConversationPin(pinned, false, 1600, 600, 700); // Scroll automatico nao desfixa.
  assert.equal(pinned, true);
  pinned = updateConversationPin(pinned, true, 1600, 600, 700); // Usuario subiu.
  assert.equal(pinned, false);
  assert.equal(shouldKeepConversationAtBottom(pinned, false, 1600, 320), false);
  assert.equal(shouldKeepConversationAtBottom(pinned, false, 1800, 600), false);
  pinned = updateConversationPin(pinned, true, 1600, 600, 970); // Usuario voltou ao fim.
  assert.equal(pinned, true);
  assert.equal(shouldKeepConversationAtBottom(pinned, false, 1800, 600), true);
});

function createVoiceHarness(stopImplementation) {
  const slots = [];
  let cursor = 0;
  const removed = [];
  const ready = [];
  const recorder = {
    isRecording: false,
    uri: null,
    async prepareToRecordAsync() { this.uri = 'file:///recording.m4a'; },
    record() { this.isRecording = true; },
    stop: stopImplementation,
  };
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(callback) { return callback; },
    useEffect() {},
  };
  const audio = {
    RecordingPresets: { HIGH_QUALITY: {} },
    requestRecordingPermissionsAsync: async () => ({ granted: true }),
    setAudioModeAsync: async () => {},
    useAudioRecorder: () => recorder,
    useAudioPlayer: () => ({ pause() {} }),
    useAudioPlayerStatus: () => ({ didJustFinish: false, error: null, playing: false }),
  };
  class FakeFile {
    constructor(uri) { this.uri = uri; this.exists = true; this.size = 10; }
    delete() { removed.push(this.uri); }
  }
  const { useConversationVoice } = loadTypeScript('../src/features/conversations/audio/use-conversation-voice.ts', {
    react,
    'expo-audio': audio,
    'expo-file-system': { File: FakeFile, Paths: { cache: {} } },
    '../conversation-audio.service': {
      getConversationAudioErrorMessage: () => 'audio-error',
      removeTemporaryAudio: (uri) => removed.push(uri),
      synthesizeConversationSpeech: async () => new ArrayBuffer(0),
    },
  });
  const render = () => {
    cursor = 0;
    return useConversationVoice({
      conversationId: 'conversation-1',
      enabled: true,
      onRecordingReady: async (item) => { ready.push(item); },
    });
  };
  return { recorder, removed, ready, render };
}

test('cancelar gravação descarta o arquivo e não inicia STT', async () => {
  const harness = createVoiceHarness(async function stop() { this.isRecording = false; });
  await harness.render().startRecording();
  const controls = harness.render();
  assert.equal(controls.phase, 'recording');

  await controls.cancelRecording();
  await controls.stopRecording(); // A tap queued before the idle render must be ignored.
  assert.equal(harness.render().phase, 'idle');
  assert.deepEqual(harness.removed, ['file:///recording.m4a']);
  assert.equal(harness.ready.length, 0);
});

test('cancelamento durante stop impede que a gravação seja processada', async () => {
  let finishStop;
  let stops = 0;
  const harness = createVoiceHarness(function stop() {
    stops += 1;
    return new Promise((resolve) => { finishStop = () => { this.isRecording = false; resolve(); }; });
  });
  await harness.render().startRecording();
  const controls = harness.render();
  const finishing = controls.stopRecording();
  const duplicateFinish = controls.stopRecording();
  await controls.cancelRecording();
  finishStop();
  await Promise.all([finishing, duplicateFinish]);

  assert.equal(stops, 1);
  assert.equal(harness.ready.length, 0);
  assert.ok(harness.removed.includes('file:///recording.m4a'));
  assert.equal(harness.render().phase, 'idle');
});

test('cancelar após parada automática ainda descarta o áudio', async () => {
  const harness = createVoiceHarness(async function stop() { this.isRecording = false; });
  await harness.render().startRecording();
  harness.recorder.isRecording = false;
  await harness.render().cancelRecording();

  assert.equal(harness.ready.length, 0);
  assert.deepEqual(harness.removed, ['file:///recording.m4a']);
  assert.equal(harness.render().phase, 'idle');
});

test('concluir normalmente entrega o arquivo uma única vez', async () => {
  const harness = createVoiceHarness(async function stop() { this.isRecording = false; });
  await harness.render().startRecording();
  const controls = harness.render();
  await controls.stopRecording();

  assert.equal(harness.ready.length, 1);
  assert.equal(harness.ready[0].uri, 'file:///recording.m4a');
  assert.equal(harness.render().phase, 'transcribing');
  assert.deepEqual(harness.removed, []);
});

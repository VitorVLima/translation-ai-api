const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadTypeScript(relativePath, dependencies = {}, globals = {}) {
  const file = path.resolve(__dirname, relativePath);
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ URL, console, ...globals });
  const execute = vm.runInContext(`(function(require, module, exports) {${output}\n})`, context, { filename: file });
  execute((request) => {
    if (request.endsWith('/theme/useThemedStyles')) return { useThemedStyles: (styles) => styles };
    if (Object.prototype.hasOwnProperty.call(dependencies, request)) return dependencies[request];
    throw new Error(`Unexpected runtime import: ${request}`);
  }, module, module.exports);
  return module.exports;
}

test('TTS usa o idioma de origem e destino do Tradutor', async () => {
  const calls = [];
  const speech = loadAudioService(async (path, options) => {
    calls.push({ path, options });
    return { ok: true, status: 200, headers: { get: () => 'audio/wav' }, arrayBuffer: async () => new Uint8Array([1]).buffer };
  }, class { append() {} });
  await speech.synthesizeSpeechForLanguage('Bom dia', 'pt');
  await speech.synthesizeSpeechForLanguage('Good morning', 'en');
  assert.deepEqual(JSON.parse(calls[0].options.body), { language: 'pt', text: 'Bom dia' });
  assert.deepEqual(JSON.parse(calls[1].options.body), { language: 'en', text: 'Good morning' });
});

test('STT recebe o idioma de origem e mantém o contrato multipart', async () => {
  const entries = [];
  class TestFormData { append(name, value, filename) { entries.push({ name, value, filename }); } }
  const speech = loadAudioService(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ text: 'Bom dia', language: 'pt' }),
  }), TestFormData);
  const result = await speech.transcribeConversationAudio({ uri: 'file:///recording.m4a', name: 'recording.m4a', mimeType: 'audio/mp4' }, 'pt');
  assert.equal(result.language, 'pt');
  assert.equal(entries[0].name, 'file');
  assert.equal(entries[0].filename, 'recording.m4a');
  assert.equal(entries[1].name, 'language');
  assert.equal(entries[1].value, 'pt');
});

test('Tradutor encadeia ditado e tradução mantendo idiomas no TTS', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/features/translator/screens/TranslatorScreen.tsx'), 'utf8');
  assert.match(source, /useTranslatorVoice/);
  assert.match(source, /setInput\(text\);\s*void runTranslation\(text\)/);
  assert.match(source, /voice\.cancelRecording\(\)/);
  assert.match(source, /speech\.play\('word', input\.trim\(\), sourceLanguage\)/);
  assert.match(source, /speech\.play\('example', translation, targetLanguage\)/);
  assert.match(source, /voice\.phase === 'recording'/);
  assert.match(source, /disabled=\{isTranslating \|\| voiceBusy \|\| !input\.trim\(\)\}/);
});

function loadAudioService(authenticatedFetch, FormData) {
  return loadTypeScript('../src/features/conversations/conversation-audio.service.ts', {
    '../../api/authenticated-fetch': { authenticatedFetch },
    'expo-file-system': { File: class {
      constructor(uri) { this.uri = uri; this.exists = true; this.size = 4; }
      slice() { return this; }
      delete() {}
    } },
  }, { FormData });
}

function loadService(authenticatedFetch) {
  return loadTypeScript('../src/features/translator/translator.service.ts', {
    '../../api/authenticated-fetch': { authenticatedFetch },
    './translator.types': {},
  });
}

test('traduz PT para EN com payload explícito e enrichment real', async () => {
  const calls = [];
  const service = loadService(async (path, options) => {
    calls.push({ path, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        translation: 'Good morning',
        enrichment: { usage: 'Saudação comum.', examples: [{ text: 'Good morning, Ana.', translation: 'Bom dia, Ana.' }] },
      }),
    };
  });

  const result = await service.translateText({ text: 'Bom dia', sourceLanguage: 'pt', targetLanguage: 'en' });
  assert.equal(result.translation, 'Good morning');
  assert.equal(result.enrichment.examples.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/v1/translate');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    text: 'Bom dia', sourceLanguage: 'pt', targetLanguage: 'en',
  });
});

test('traduz EN para PT e aceita enrichment nulo', async () => {
  const service = loadService(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ translation: 'Bom dia', enrichment: null }),
  }));
  const result = await service.translateText({ text: 'Good morning', sourceLanguage: 'en', targetLanguage: 'pt' });
  assert.equal(result.translation, 'Bom dia');
  assert.equal(result.enrichment, null);
});

test('texto vazio, idiomas iguais e limite não fazem request', async () => {
  let calls = 0;
  const service = loadService(async () => { calls += 1; return { ok: true, json: async () => ({}) }; });
  await assert.rejects(() => service.translateText({ text: '  ', sourceLanguage: 'pt', targetLanguage: 'en' }), /translation-validation/);
  await assert.rejects(() => service.translateText({ text: 'hello', sourceLanguage: 'en', targetLanguage: 'en' }), /translation-validation/);
  await assert.rejects(() => service.translateText({ text: 'x'.repeat(5001), sourceLanguage: 'pt', targetLanguage: 'en' }), /translation-validation/);
  assert.equal(calls, 0);
});

test('resposta sem tradução é inválida e erros HTTP preservam status', async () => {
  const invalid = loadService(async () => ({ ok: true, status: 200, json: async () => ({ enrichment: null }) }));
  await assert.rejects(() => invalid.translateText({ text: 'Oi', sourceLanguage: 'pt', targetLanguage: 'en' }), /translation-invalid-response/);

  const unavailable = loadService(async () => ({ ok: false, status: 503, json: async () => ({}) }));
  await assert.rejects(
    () => unavailable.translateText({ text: 'Oi', sourceLanguage: 'pt', targetLanguage: 'en' }),
    (error) => error.status === 503 && error.kind === 'http',
  );
  assert.match(unavailable.getTranslationErrorMessage(new unavailable.TranslationRequestError('http', 503)), /temporariamente indisponível/);
});

test('tela invalida resultado ao editar, suporta copiar e mantém Back determinístico', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/features/translator/screens/TranslatorScreen.tsx'), 'utf8');
  const route = fs.readFileSync(path.resolve(__dirname, '../app/(app)/practice/translator.tsx'), 'utf8');
  assert.match(source, /setTranslation\(null\)/);
  assert.match(source, /Clipboard\.setStringAsync/);
  assert.match(source, /submitting\.current/);
  assert.match(source, /useDeterministicBack\(goToPractice\)/);
  assert.match(route, /<TranslatorScreen \/>/);
  assert.match(source, /router\.replace\('\/practice'\)/);
  assert.match(source, /const \[isEnrichmentExpanded, setIsEnrichmentExpanded\] = useState\(false\)/);
  assert.match(source, /isEnrichmentExpanded/);
  assert.match(source, /setIsEnrichmentExpanded\(\(expanded\) => !expanded\)/);
  assert.match(source, /hiddenDetails/);
  assert.match(source, /clearResult = useCallback/);
  assert.match(source, /setIsEnrichmentExpanded\(false\)/);
  assert.match(source, /hasEnrichment \?/);
});

function createScreenHarness(translateText, speech = { activeKey: null, loadingKey: null, error: null, stop() {}, play() {} }) {
  const slots = [];
  let cursor = 0;
  let onTranscribed;
  let voicePhase = 'idle';
  const jsx = (type, props) => ({ type, props: props ?? {} });
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
  };
  const { TranslatorScreen } = loadTypeScript('../src/features/translator/screens/TranslatorScreen.tsx', {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'expo-router': { router: { replace() {} } },
    'expo-clipboard': { setStringAsync: async () => {} },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'expo-symbols': { SymbolView: 'SymbolView' },
    'react-native': {
      ActivityIndicator: 'ActivityIndicator', KeyboardAvoidingView: 'KeyboardAvoidingView',
      Platform: { OS: 'android' }, Pressable: 'Pressable', ScrollView: 'ScrollView',
      Text: 'Text', TextInput: 'TextInput', View: 'View', StyleSheet: { create: (styles) => styles },
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '../../../components/ScreenHeader': { ScreenHeader: 'ScreenHeader' },
    '../../../hooks/use-deterministic-back': { useDeterministicBack() {} },
    '../../vocabulary/audio/use-vocabulary-speech': { useVocabularySpeech: () => speech },
    '../audio/use-translator-voice': { useTranslatorVoice: (options) => {
      onTranscribed = options.onTranscribed;
      return { phase: voicePhase, error: null, clearError() {}, startRecording() {}, stopRecording() {}, cancelRecording() {} };
    } },
    '../translator.service': {
      getLanguageLabel: (value) => value,
      getTranslationErrorMessage: (error) => error.message,
      getTranslationPlaceholder: () => '', translateText,
    },
  });
  function flatten(node) {
    if (node == null || typeof node === 'boolean') return [];
    if (Array.isArray(node)) return node.flatMap(flatten);
    if (typeof node !== 'object') return [node];
    return [node, ...flatten(node.props.children)];
  }
  return {
    render() { cursor = 0; return TranslatorScreen(); },
    find(tree, label) { return flatten(tree).find((node) => node?.props?.accessibilityLabel === label); },
    transcribe(text) { onTranscribed(text); },
    setVoicePhase(phase) { voicePhase = phase; },
    texts(tree) { return flatten(tree).filter((node) => typeof node === 'string').join(' '); },
  };
}

test('texto digitado só traduz pelo botão e taps repetidos não duplicam request', async () => {
  const requests = [];
  let finish;
  const screen = createScreenHarness((request) => {
    requests.push(request);
    return new Promise((resolve) => { finish = resolve; });
  });
  let tree = screen.render();
  screen.find(tree, 'Texto em pt').props.onChangeText('Bom dia');
  tree = screen.render();
  assert.equal(requests.length, 0);
  screen.find(tree, 'Traduzir texto').props.onPress();
  screen.find(tree, 'Traduzir texto').props.onPress();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].text, 'Bom dia');
  finish({ translation: 'Good morning', enrichment: null });
  await new Promise(setImmediate);
  assert.match(screen.texts(screen.render()), /Good morning/);
});

test('transcrição substitui texto antigo, traduz uma vez e persiste após erro', async () => {
  const requests = [];
  let fail;
  const screen = createScreenHarness((request) => {
    requests.push(request);
    return new Promise((_, reject) => { fail = reject; });
  });
  let tree = screen.render();
  screen.find(tree, 'Texto em pt').props.onChangeText('texto antigo');
  tree = screen.render();
  screen.setVoicePhase('transcribing');
  screen.render();
  screen.transcribe('fala reconhecida');
  tree = screen.render();
  assert.equal(screen.find(tree, 'Texto em pt').props.value, 'fala reconhecida');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].text, 'fala reconhecida');
  screen.transcribe('fala reconhecida');
  assert.equal(requests.length, 1);
  fail(new Error('falha na tradução'));
  await new Promise(setImmediate);
  tree = screen.render();
  assert.equal(screen.find(tree, 'Texto em pt').props.value, 'fala reconhecida');
  assert.match(screen.texts(tree), /falha na tradução/);
});

function createVoiceHarness(transcribe) {
  const slots = [];
  let cursor = 0;
  let sttCalls = 0;
  let removed = 0;
  const recorder = {
    isRecording: false,
    uri: null,
    async prepareToRecordAsync() {},
    record() { this.isRecording = true; this.uri = 'file:///recording.m4a'; },
    async stop() { this.isRecording = false; },
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
    useEffect(setup) { if (!slots.effectStarted) { slots.effectStarted = true; setup(); } },
  };
  const { useTranslatorVoice } = loadTypeScript('../src/features/translator/audio/use-translator-voice.ts', {
    react,
    'expo-audio': {
      RecordingPresets: { HIGH_QUALITY: {} },
      requestRecordingPermissionsAsync: async () => ({ granted: true }),
      setAudioModeAsync: async () => {},
      useAudioRecorder: () => recorder,
    },
    'expo-file-system': { File: class { constructor() { this.exists = true; this.size = 10; } } },
    '../../conversations/conversation-audio.service': {
      getConversationAudioErrorMessage: () => 'Falha no STT',
      removeTemporaryAudio: () => { removed += 1; },
      transcribeConversationAudio: (...args) => { sttCalls += 1; return transcribe(...args); },
    },
  });
  const received = [];
  return {
    render() { cursor = 0; return useTranslatorVoice({ language: 'pt', onTranscribed: (text) => received.push(text) }); },
    recorder, received,
    sttCalls: () => sttCalls,
    removed: () => removed,
  };
}

test('concluir gravação chama STT e entrega a transcrição uma vez', async () => {
  const voice = createVoiceHarness(async () => ({ text: 'Bom dia', language: 'pt' }));
  await voice.render().startRecording();
  await voice.render().stopRecording();
  assert.equal(voice.sttCalls(), 1);
  assert.deepEqual(voice.received, ['Bom dia']);
  assert.equal(voice.removed(), 1);
  assert.equal(voice.render().phase, 'idle');
});

test('cancelar gravação descarta áudio sem STT nem tradução', async () => {
  const voice = createVoiceHarness(async () => ({ text: 'Não usar', language: 'pt' }));
  await voice.render().startRecording();
  await voice.render().cancelRecording();
  assert.equal(voice.sttCalls(), 0);
  assert.deepEqual(voice.received, []);
  assert.equal(voice.removed(), 1);
  assert.equal(voice.render().phase, 'idle');
});

test('cancelar enquanto o stop está pendente invalida a transcrição', async () => {
  const voice = createVoiceHarness(async () => ({ text: 'Não usar', language: 'pt' }));
  await voice.render().startRecording();
  let finishStop;
  voice.recorder.stop = () => new Promise((resolve) => { finishStop = resolve; });
  const controls = voice.render();
  const stopping = controls.stopRecording();
  await controls.cancelRecording();
  finishStop();
  await stopping;
  assert.equal(voice.sttCalls(), 0);
  assert.deepEqual(voice.received, []);
  assert.equal(voice.removed(), 1);
});

test('erro ou texto vazio no STT não inicia tradução', async () => {
  for (const transcribe of [async () => { throw new Error('STT failed'); }, async () => ({ text: '   ', language: 'pt' })]) {
    const voice = createVoiceHarness(transcribe);
    await voice.render().startRecording();
    await voice.render().stopRecording();
    assert.equal(voice.sttCalls(), 1);
    assert.deepEqual(voice.received, []);
    assert.equal(voice.render().phase, 'error');
  }
});

test('Tradutor mostra loading apenas no botão de áudio ativo', async () => {
  const speech = { activeKey: null, loadingKey: null, error: null, stop() {}, calls: [],
    play(key) { this.calls.push(key); this.loadingKey = key; } };
  const screen = createScreenHarness(async () => ({ translation: 'Good morning', enrichment: null }), speech);
  let tree = screen.render();
  screen.find(tree, 'Texto em pt').props.onChangeText('Bom dia');
  tree = screen.render();
  screen.find(tree, 'Traduzir texto').props.onPress();
  await new Promise(setImmediate);
  tree = screen.render();
  screen.find(tree, 'Ouvir texto original').props.onPress();
  tree = screen.render();
  const original = screen.find(tree, 'Carregando áudio do texto original');
  const translated = screen.find(tree, 'Ouvir tradução');
  assert.equal(original.props.disabled, true);
  assert.equal(original.props.accessibilityState.busy, true);
  assert.match(screen.texts(original), /Carregando/);
  assert.equal(translated.props.accessibilityState.busy, false);
  original.props.onPress();
  assert.deepEqual(speech.calls, ['word']);
  speech.loadingKey = null;
  assert.ok(screen.find(screen.render(), 'Ouvir texto original'));
  tree = screen.render();
  screen.find(tree, 'Ouvir tradução').props.onPress();
  assert.deepEqual(speech.calls, ['word', 'example']);
  assert.ok(screen.find(screen.render(), 'Carregando áudio da tradução'));
});

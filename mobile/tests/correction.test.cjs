const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadTypeScript(relativePath, dependencies = {}) {
  const file = path.resolve(__dirname, relativePath);
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ URL, console });
  const execute = vm.runInContext(`(function(require, module, exports) {${output}\n})`, context, { filename: file });
  execute((request) => {
    if (request.endsWith('/theme/useThemedStyles')) return { useThemedStyles: (styles) => styles };
    if (Object.prototype.hasOwnProperty.call(dependencies, request)) return dependencies[request];
    throw new Error(`Unexpected runtime import: ${request}`);
  }, module, module.exports);
  return module.exports;
}

function loadService(authenticatedFetch) {
  return loadTypeScript('../src/features/correction/correction.service.ts', {
    '../../api/authenticated-fetch': { authenticatedFetch },
    './correction.types': {},
  });
}

test('correção envia o contrato real em inglês e preserva conteúdo educacional', async () => {
  const calls = [];
  const service = loadService(async (path, options) => {
    calls.push({ path, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        correctedText: 'I went to school yesterday.',
        status: 'CORRECTED',
        explanation: 'Use o passado simples.',
        usageTip: 'Use went com yesterday.',
        alternatives: ['I attended school yesterday.'],
        examples: [{ text: 'I went to work yesterday.', translation: 'Eu fui trabalhar ontem.' }],
      }),
    };
  });
  const result = await service.correctText('I go to school yesterday');
  assert.equal(result.correctedText, 'I went to school yesterday.');
  assert.equal(result.examples.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, '/api/v1/correct');
  assert.deepEqual(JSON.parse(calls[0].options.body), { text: 'I go to school yesterday', language: 'en' });
});

test('texto vazio ou acima do limite não envia request', async () => {
  let calls = 0;
  const service = loadService(async () => { calls += 1; return { ok: true, json: async () => ({}) }; });
  await assert.rejects(() => service.correctText('  '), (error) => error.kind === 'validation');
  await assert.rejects(() => service.correctText('x'.repeat(5001)), (error) => error.kind === 'validation');
  assert.equal(calls, 0);
});

test('status CORRECT é aceito e erros HTTP preservam status', async () => {
  const correct = loadService(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ correctedText: 'I went home.', status: 'CORRECT', explanation: null, usageTip: null, alternatives: [], examples: [] }),
  }));
  const result = await correct.correctText('I went home.');
  assert.equal(result.status, 'CORRECT');
  assert.equal(result.explanation, null);

  const unavailable = loadService(async () => ({ ok: false, status: 503 }));
  await assert.rejects(() => unavailable.correctText('I go home.'), (error) => error.status === 503 && error.kind === 'http');
});

test('tela preserva STT, TTS, clipboard, accordion fechado e Back determinístico', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/features/correction/screens/CorrectionScreen.tsx'), 'utf8');
  const route = fs.readFileSync(path.resolve(__dirname, '../app/(app)/practice/correction.tsx'), 'utf8');
  assert.match(source, /useTranslatorVoice/);
  assert.match(source, /setInput\(text\);\s*void runCorrection\(text\)/);
  assert.match(source, /voice\.cancelRecording\(\)/);
  assert.match(source, /speech\.play\('word', result\.correctedText, 'en'\)/);
  assert.match(source, /Clipboard\.setStringAsync/);
  assert.match(source, /const \[isLearningExpanded, setIsLearningExpanded\] = useState\(false\)/);
  assert.match(source, /setIsLearningExpanded\(\(expanded\) => !expanded\)/);
  assert.match(source, /clearResult = useCallback/);
  assert.match(source, /router\.replace\('\/practice'\)/);
  assert.match(source, /useDeterministicBack\(goToPractice\)/);
  assert.match(route, /<CorrectionScreen \/>/);
});

function createScreenHarness(correctText, speech = { activeKey: null, loadingKey: null, error: null, stop() {}, play() {} }) {
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
  const { CorrectionScreen } = loadTypeScript('../src/features/correction/screens/CorrectionScreen.tsx', {
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
    '../../translator/audio/use-translator-voice': { useTranslatorVoice: (options) => {
      onTranscribed = options.onTranscribed;
      return { phase: voicePhase, error: null, clearError() {}, startRecording() {}, stopRecording() {}, cancelRecording() {} };
    } },
    '../correction.service': {
      CorrectionRequestError: class extends Error {},
      correctText,
      CORRECTION_MAX_CHARACTERS: 5000,
      getCorrectionErrorMessage: (error) => error.message,
      getCorrectionTitle: () => 'Texto corrigido',
    },
  });
  function flatten(node) {
    if (node == null || typeof node === 'boolean') return [];
    if (Array.isArray(node)) return node.flatMap(flatten);
    if (typeof node !== 'object') return [node];
    return [node, ...flatten(node.props.children)];
  }
  return {
    render() { cursor = 0; return CorrectionScreen(); },
    find(tree, label) { return flatten(tree).find((node) => node?.props?.accessibilityLabel === label); },
    transcribe(text) { onTranscribed(text); },
    setVoicePhase(phase) { voicePhase = phase; },
    texts(tree) { return flatten(tree).filter((node) => typeof node === 'string').join(' '); },
  };
}

function correctedResult() {
  return { correctedText: 'I went home.', status: 'CORRECTED', explanation: null, usageTip: null, alternatives: [], examples: [] };
}

test('texto digitado só corrige pelo botão e taps repetidos fazem um request', async () => {
  const requests = [];
  let finish;
  const screen = createScreenHarness((text) => { requests.push(text); return new Promise((resolve) => { finish = resolve; }); });
  let tree = screen.render();
  screen.find(tree, 'Texto em inglês para corrigir').props.onChangeText('I go home.');
  tree = screen.render();
  assert.equal(requests.length, 0);
  screen.find(tree, 'Corrigir texto').props.onPress();
  screen.find(tree, 'Corrigir texto').props.onPress();
  assert.deepEqual(requests, ['I go home.']);
  finish(correctedResult());
  await new Promise(setImmediate);
  assert.match(screen.texts(screen.render()), /I went home/);
});

test('transcrição substitui texto antigo, corrige uma vez e fica disponível após erro', async () => {
  const requests = [];
  let fail;
  const screen = createScreenHarness((text) => { requests.push(text); return new Promise((_, reject) => { fail = reject; }); });
  let tree = screen.render();
  screen.find(tree, 'Texto em inglês para corrigir').props.onChangeText('old text');
  screen.render();
  screen.setVoicePhase('transcribing');
  screen.render();
  screen.transcribe('I go home.');
  tree = screen.render();
  assert.equal(screen.find(tree, 'Texto em inglês para corrigir').props.value, 'I go home.');
  assert.deepEqual(requests, ['I go home.']);
  screen.transcribe('I go home.');
  assert.equal(requests.length, 1);
  fail(new Error('Falha na correção'));
  await new Promise(setImmediate);
  tree = screen.render();
  assert.equal(screen.find(tree, 'Texto em inglês para corrigir').props.value, 'I go home.');
  assert.match(screen.texts(tree), /Falha na correção/);
});

test('botão Ouvir mostra loading apenas para sua operação e retorna ao estado normal', async () => {
  const speech = { activeKey: null, loadingKey: null, error: null, stop() {}, calls: 0,
    play() { this.calls += 1; this.loadingKey = 'word'; } };
  const screen = createScreenHarness(async () => correctedResult(), speech);
  let tree = screen.render();
  screen.find(tree, 'Texto em inglês para corrigir').props.onChangeText('I go home.');
  tree = screen.render();
  screen.find(tree, 'Corrigir texto').props.onPress();
  await new Promise(setImmediate);
  tree = screen.render();
  screen.find(tree, 'Ouvir texto corrigido').props.onPress();
  tree = screen.render();
  const loadingButton = screen.find(tree, 'Carregando áudio do texto corrigido');
  assert.equal(loadingButton.props.disabled, true);
  assert.equal(loadingButton.props.accessibilityState.busy, true);
  assert.match(screen.texts(loadingButton), /Carregando/);
  loadingButton.props.onPress();
  assert.equal(speech.calls, 1);
  speech.loadingKey = null;
  assert.ok(screen.find(screen.render(), 'Ouvir texto corrigido'));
});

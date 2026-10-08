const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function createSpeechHarness(synthesize) {
  const slots = [];
  let cursor = 0;
  let synthCalls = 0;
  const player = { replaces: 0, plays: 0, pause() {}, replace() { this.replaces += 1; }, play() { this.plays += 1; } };
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
    useEffect(setup) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { cleanup: setup() };
    },
  };
  const file = path.resolve(__dirname, '../src/features/vocabulary/audio/use-vocabulary-speech.ts');
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ console });
  vm.runInContext(`(function(require, module, exports) {${output}\n})`, context, { filename: file })((request) => {
    if (request === 'react') return react;
    if (request === 'expo-audio') return {
      setAudioModeAsync: async () => {}, useAudioPlayer: () => player,
      useAudioPlayerStatus: () => ({ playing: false, didJustFinish: false, error: null }),
    };
    if (request === 'expo-file-system') return {
      Paths: { cache: '/cache' },
      File: class {
        constructor() { this.uri = 'file:///audio.wav'; this.exists = false; this.size = 0; }
        write(bytes) { this.exists = true; this.size = bytes.length; }
        delete() { this.exists = false; }
      },
    };
    if (request === '../../conversations/conversation-audio.service') return {
      synthesizeSpeechForLanguage: (...args) => { synthCalls += 1; return synthesize(...args); },
    };
    throw new Error(`Unexpected import: ${request}`);
  }, module, module.exports);
  return {
    render() { cursor = 0; return module.exports.useVocabularySpeech(); },
    unmount() { for (const slot of slots) if (slot?.cleanup) slot.cleanup(); },
    player,
    synthCalls: () => synthCalls,
  };
}

test('TTS marca loading imediatamente, bloqueia taps repetidos e limpa ao tocar', async () => {
  let finish;
  const speech = createSpeechHarness(() => new Promise((resolve) => { finish = resolve; }));
  const first = speech.render().play('word', 'Hello', 'en');
  assert.equal(speech.render().loadingKey, 'word');
  const duplicate = speech.render().play('word', 'Hello', 'en');
  await new Promise(setImmediate);
  assert.equal(speech.synthCalls(), 1);
  finish(new Uint8Array([1, 2]).buffer);
  await Promise.all([first, duplicate]);
  assert.equal(speech.render().loadingKey, null);
  assert.equal(speech.render().activeKey, 'word');
  assert.equal(speech.player.plays, 1);
});

test('erro do TTS remove loading e permite nova tentativa', async () => {
  let calls = 0;
  const speech = createSpeechHarness(async () => {
    calls += 1;
    if (calls === 1) throw new Error('TTS failed');
    return new Uint8Array([1]).buffer;
  });
  await speech.render().play('word', 'Hello', 'en');
  assert.equal(speech.render().loadingKey, null);
  assert.ok(speech.render().error);
  await speech.render().play('word', 'Hello', 'en');
  assert.equal(speech.synthCalls(), 2);
  assert.equal(speech.render().loadingKey, null);
  assert.equal(speech.player.plays, 1);
});

test('cancelar ou desmontar durante TTS limpa loading e ignora resposta tardia', async () => {
  let finish;
  const speech = createSpeechHarness(() => new Promise((resolve) => { finish = resolve; }));
  const pending = speech.render().play('word', 'Hello', 'en');
  await new Promise(setImmediate);
  speech.render().stop();
  assert.equal(speech.render().loadingKey, null);
  finish(new Uint8Array([1]).buffer);
  await pending;
  assert.equal(speech.player.replaces, 0);

  const second = speech.render().play('example', 'World', 'en');
  await new Promise(setImmediate);
  assert.equal(speech.render().loadingKey, 'example');
  speech.unmount();
  finish(new Uint8Array([1]).buffer);
  await second;
  assert.equal(speech.player.replaces, 0);
});

test('cada instância mantém loading independente', async () => {
  let finish;
  const translator = createSpeechHarness(() => new Promise((resolve) => { finish = resolve; }));
  const correction = createSpeechHarness(async () => new Uint8Array([1]).buffer);
  const pending = translator.render().play('word', 'Hello', 'en');
  assert.equal(translator.render().loadingKey, 'word');
  assert.equal(correction.render().loadingKey, null);
  await correction.render().play('word', 'World', 'en');
  assert.equal(correction.render().loadingKey, null);
  await new Promise(setImmediate);
  finish(new Uint8Array([1]).buffer);
  await pending;
});

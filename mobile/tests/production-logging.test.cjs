const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/features/conversations/conversation-audio.service.ts'), 'utf8');
const audio = { uri: 'file:///private/user@example.test/audio.m4a', name: 'audio.m4a', mimeType: 'audio/mp4' };

function service(fetch, development = false) {
  const logs = [];
  class File { constructor() { this.exists = true; this.size = 128; this.type = 'audio/mp4'; } }
  class Multipart { append() {} }
  const context = vm.createContext({ FormData: Multipart, __DEV__: development,
    console: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) } });
  const module = { exports: {} };
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const execute = vm.runInContext(`(function(require, module, exports) {${output}\n})`, context);
  execute(name => name === 'expo-file-system' ? { File } : { authenticatedFetch: fetch }, module, module.exports);
  return { ...module.exports, logs };
}

test('STT production failures never log a local URI, token or provider response', async () => {
  const rejected = service(async () => new Response(JSON.stringify({ message: 'Bearer secret file:///private/audio.m4a' }), { status: 503 }));
  await assert.rejects(rejected.transcribeConversationAudio(audio), error => error.kind === 'http' && error.status === 503);
  assert.deepEqual(rejected.logs, []);

  const unavailable = service(async () => { throw new Error('Authorization: Bearer secret file:///private/audio.m4a'); });
  await assert.rejects(unavailable.transcribeConversationAudio(audio), error => error.kind === 'network');
  assert.deepEqual(unavailable.logs, []);
  assert.match(unavailable.getConversationAudioErrorMessage(new Error('Bearer secret')), /Tente novamente/);
});

test('STT development diagnostics retain size and status without URI or external details', async () => {
  const exposed = service(async () => new Response(JSON.stringify({ detail: 'Bearer secret file:///private/audio.m4a' }), { status: 503 }), true);
  await assert.rejects(exposed.transcribeConversationAudio(audio), error => error.status === 503);
  const output = JSON.stringify(exposed.logs);
  assert.match(output, /128/);
  assert.match(output, /503/);
  assert.doesNotMatch(output, /file:\/\/\/|user@example|Bearer secret|Authorization/);
});

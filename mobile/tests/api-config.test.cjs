const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

const mobileRoot = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(mobileRoot, 'src/config/api.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadApiUrl(value, development) {
  const module = { exports: {} };
  const context = vm.createContext({
    __DEV__: development,
    process: { env: value === undefined ? {} : { EXPO_PUBLIC_API_URL: value } },
    URL,
  });
  vm.runInContext(`(function(module, exports) {${compiled}\n})`, context)(module, module.exports);
  return module.exports.API_URL;
}

function resolveAppConfig(value, profile) {
  const env = { ...process.env, NODE_ENV: 'production', EAS_BUILD_PROFILE: profile };
  delete env.EXPO_PUBLIC_API_URL;
  if (value !== undefined) env.EXPO_PUBLIC_API_URL = value;
  return spawnSync(process.execPath, ['-e', "require('./app.config.js')({config:{}})"], {
    cwd: mobileRoot, env, encoding: 'utf8',
  });
}

test('development retains the Android emulator fallback and permits a configured HTTP address', () => {
  assert.equal(loadApiUrl(undefined, true), 'http://10.0.2.2:8080');
  assert.equal(loadApiUrl('http://192.0.2.10:8080/', true), 'http://192.0.2.10:8080');
});

test('production runtime rejects missing, malformed and cleartext API addresses', () => {
  assert.throws(() => loadApiUrl(undefined, false), /EXPO_PUBLIC_API_URL is required/);
  assert.throws(() => loadApiUrl('invalid', false), /EXPO_PUBLIC_API_URL is invalid/);
  assert.throws(() => loadApiUrl('http://api.example.test', false), /must use HTTPS/);
  assert.equal(loadApiUrl('https://api.example.test/', false), 'https://api.example.test');
});

test('production configuration stops a build without a valid HTTPS API address', () => {
  assert.notEqual(resolveAppConfig(undefined, 'production').status, 0);
  assert.notEqual(resolveAppConfig('http://api.example.test', 'production').status, 0);
  assert.equal(resolveAppConfig('https://api.example.test', 'production').status, 0);
});

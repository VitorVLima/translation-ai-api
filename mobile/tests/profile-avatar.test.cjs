const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relativePath, dependencies = {}) {
  const file = path.resolve(__dirname, relativePath);
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, exports) {${output}\n})`, { URL })((name) => {
    if (Object.prototype.hasOwnProperty.call(dependencies, name)) return dependencies[name];
    throw new Error(`Unexpected import: ${name}`);
  }, module, module.exports);
  return module.exports;
}

const avatarCatalog = [
  { key: 'avatar_default', displayName: 'Avatar padrão', imageUrl: '/api/v1/avatars/avatar_default/image' },
  ...Array.from({ length: 6 }, (_item, index) => ({ key: `avatar_0${index + 1}`, displayName: `Avatar ${index + 1}`, imageUrl: `/api/v1/avatars/avatar_0${index + 1}/image` })),
  { key: 'tutor_default', displayName: 'Tutor', imageUrl: '/api/v1/avatars/tutor_default/image' },
];

test('profile avatar catalogue exposes only predefined user avatars', async () => {
  const service = load('../src/features/profile/profile.service.ts', {
    '../../api/authenticated-fetch': { authenticatedFetch: async () => ({ ok: true, json: async () => avatarCatalog }) },
  });
  const avatars = await service.getPredefinedAvatars();
  assert.deepEqual(avatars.map((avatar) => avatar.key), ['avatar_default', 'avatar_01', 'avatar_02', 'avatar_03', 'avatar_04', 'avatar_05', 'avatar_06']);
});

test('profile avatar change persists the selected key through the authenticated profile endpoint', async () => {
  const calls = [];
  const profile = {
    preferredName: 'Ana', birthDate: null, age: null, englishLevel: null, learningGoal: null,
    avatarType: 'PREDEFINED', avatarKey: 'avatar_03', onboardingCompleted: false,
    onboardingStatus: 'PENDING', initialSetupCompleted: true, createdAt: '', updatedAt: '',
  };
  const service = load('../src/features/profile/profile.service.ts', {
    '../../api/authenticated-fetch': { authenticatedFetch: async (...args) => { calls.push(args); return { ok: true, json: async () => profile }; } },
  });
  const updated = await service.setPredefinedAvatar('avatar_03');
  assert.equal(updated.avatarKey, 'avatar_03');
  assert.equal(calls[0][0], '/api/v1/users/me/profile/avatar/predefined');
  assert.equal(calls[0][1].method, 'PUT');
  assert.deepEqual(JSON.parse(calls[0][1].body), { avatarKey: 'avatar_03' });
});

test('selected profile avatar resolves to its Backend image and Profile offers later changes', () => {
  const profile = {
    preferredName: 'Ana', birthDate: null, age: null, englishLevel: null, learningGoal: null,
    avatarType: 'PREDEFINED', avatarKey: 'avatar_03', onboardingCompleted: false,
    onboardingStatus: 'PENDING', initialSetupCompleted: true, createdAt: '', updatedAt: '',
  };
  const presentation = load('../src/features/profile/profile.presentation.ts', {
    '../../i18n/translate': require('./i18n-helper.cjs'),
  });
  const view = presentation.getHomeProfilePresentation(null, profile, avatarCatalog, 'https://api.example.test');
  assert.equal(view.avatarImageUrl, 'https://api.example.test/api/v1/avatars/avatar_03/image');

  const screen = fs.readFileSync(path.resolve(__dirname, '../src/features/profile/screens/ProfileScreen.tsx'), 'utf8');
  assert.match(screen, /presentation\.avatarImageUrl/);
  assert.match(screen, /setPredefinedAvatar\(selectedAvatarKey\)/);
  assert.match(screen, /openAvatarPicker/);
});

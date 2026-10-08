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
  const execute = vm.runInNewContext(`(function(require, module, exports) {${output}\n})`, {}, { filename: file });
  execute((request) => {
    if (Object.prototype.hasOwnProperty.call(dependencies, request)) return dependencies[request];
    throw new Error(`Unexpected runtime import: ${request}`);
  }, module, module.exports);
  return module.exports;
}

const { hasHomeDataFailures, mergeHomeData } = loadTypeScript('../src/features/home/home.data.ts');
const { getHomeProfilePresentation } = loadTypeScript('../src/features/profile/profile.presentation.ts', {
  '../../i18n/translate': require('./i18n-helper.cjs'),
});

const user = { username: 'Pessoa' };
const incompleteProfile = {
  preferredName: 'Pessoa', birthDate: null, age: null, englishLevel: null, learningGoal: null,
  avatarType: 'PREDEFINED', avatarKey: 'avatar_default', onboardingCompleted: false,
  onboardingStatus: 'PENDING', createdAt: '', updatedAt: '',
};
const completeProfile = {
  ...incompleteProfile, birthDate: '2000-01-01', avatarKey: 'avatar_01',
  onboardingCompleted: true, onboardingStatus: 'COMPLETED',
};
const fulfilled = (value) => ({ status: 'fulfilled', value });

test('perfil incompleto → Home mostra card → salvar e voltar atualiza pelo Backend → card some', () => {
  const initial = {
    conversations: [],
    profile: { profile: incompleteProfile, avatars: [] },
    progress: {},
    vocabulary: {},
  };
  assert.equal(getHomeProfilePresentation(user, initial.profile.profile, [], 'https://api.example.test').showCompletion, true);

  // O GET de perfil no focus já reflete a resposta persistida do Backend após o PUT.
  const refreshed = mergeHomeData(initial, [
    fulfilled({ profile: completeProfile, avatars: [] }),
    { status: 'rejected', reason: new Error('vocabulary temporarily unavailable') },
    fulfilled(initial.progress),
    fulfilled(initial.conversations),
  ]);

  assert.equal(hasHomeDataFailures([
    fulfilled(completeProfile),
    { status: 'rejected', reason: new Error('vocabulary temporarily unavailable') },
    fulfilled(initial.progress),
    fulfilled(initial.conversations),
  ]), true);
  assert.equal(refreshed.profile.profile.onboardingStatus, 'COMPLETED');
  assert.equal(getHomeProfilePresentation(user, refreshed.profile.profile, [], 'https://api.example.test').showCompletion, false);
});

test('sem snapshot anterior, uma resposta parcial não cria Home com estado inconsistente', () => {
  const data = mergeHomeData(null, [
    fulfilled({ profile: completeProfile, avatars: [] }),
    { status: 'rejected', reason: new Error('vocabulary unavailable') },
    fulfilled({}),
    fulfilled([]),
  ]);
  assert.equal(data, null);
});

test('Home refaz GET do perfil ao receber foco e pull-to-refresh usa a mesma fonte', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/features/home/screens/HomeScreen.tsx'), 'utf8');
  assert.match(source, /useFocusEffect\(useCallback\(\(\) => \{[\s\S]*?loadHome\('focus'\)/);
  assert.match(source, /getHomeProfileData\(controller\.signal\)/);
  assert.match(source, /onRefresh=\{refreshHome\}/);
});

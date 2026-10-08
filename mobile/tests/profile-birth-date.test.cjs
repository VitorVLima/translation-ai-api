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

const date = loadTypeScript('../src/features/profile/profile.date.ts');
const { getHomeProfilePresentation } = loadTypeScript('../src/features/profile/profile.presentation.ts', {
  '../../i18n/translate': require('./i18n-helper.cjs'),
});
const { translate } = require('./i18n-helper.cjs');

test('labels estáveis e data civil aparecem em português', () => {
  const profile = { ...pendingProfile, englishLevel: 'B1', learningGoal: 'TRAVEL' };
  assert.equal(getHomeProfilePresentation(user, profile, [], 'https://api.test').levelLabel, 'B1 · Intermediário');
  assert.equal(translate('domain.goal.TRAVEL'), 'Viagens');
  assert.equal(date.formatCivilDateForDisplay('2002-08-14'), '14/08/2002');
});
const user = { username: 'Learner' };
const pendingProfile = {
  preferredName: 'Learner', birthDate: null, age: null, englishLevel: null, learningGoal: null,
  avatarType: 'PREDEFINED', avatarKey: 'avatar_default', onboardingCompleted: false,
  onboardingStatus: 'PENDING', initialSetupCompleted: false, createdAt: '', updatedAt: '',
};

test('perfil sem birthDate continua incompleto; Backend completo remove o card da Home', () => {
  assert.equal(getHomeProfilePresentation(user, pendingProfile, [], 'https://api.test').showCompletion, true);

  const profileFromBackend = {
    ...pendingProfile,
    birthDate: '1996-02-03',
    avatarKey: 'avatar_01',
    onboardingCompleted: true,
    onboardingStatus: 'COMPLETED',
  };
  assert.equal(getHomeProfilePresentation(user, profileFromBackend, [], 'https://api.test').showCompletion, false);
});

test('data civil existente é apresentada sem deslocamento de fuso e serializa no contrato LocalDate', () => {
  const pickerDate = date.parseCivilDate('1996-02-03');
  assert.equal(pickerDate.getFullYear(), 1996);
  assert.equal(pickerDate.getMonth(), 1);
  assert.equal(pickerDate.getDate(), 3);
  assert.equal(date.formatCivilDate(pickerDate), '1996-02-03');
  assert.equal(date.formatCivilDateForDisplay('1996-02-03'), '03/02/1996');
  assert.equal(date.formatCivilDateForDisplay('1996-02-31'), null);
  assert.doesNotMatch(fs.readFileSync(path.resolve(__dirname, '../src/features/profile/profile.date.ts'), 'utf8'), /toISOString/);
});

test('updateProfile envia a data civil existente sem alterar o dia', async () => {
  const calls = [];
  const responseProfile = {
    ...pendingProfile,
    birthDate: '1996-02-03',
    avatarKey: 'avatar_01',
    onboardingCompleted: true,
    onboardingStatus: 'COMPLETED',
  };
  const service = loadTypeScript('../src/features/profile/profile.service.ts', {
    '../../api/authenticated-fetch': {
      authenticatedFetch: async (requestPath, options) => {
        calls.push({ requestPath, options });
        return new Response(JSON.stringify(responseProfile), { status: 200 });
      },
    },
  });

  const updated = await service.updateProfile({
    preferredName: 'Learner',
    birthDate: date.formatCivilDate(date.parseCivilDate('1996-02-03')),
    englishLevel: null,
    learningGoal: null,
  });

  assert.equal(calls[0].requestPath, '/api/v1/users/me/profile');
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(JSON.parse(calls[0].options.body).birthDate, '1996-02-03');
  assert.equal(updated.birthDate, '1996-02-03');
  assert.equal(updated.onboardingStatus, 'COMPLETED');
});

test('seletor limita ao dia UTC atual e valida data futura antes do PUT', () => {
  const now = new Date('2026-10-02T01:30:00.000Z');
  assert.equal(date.getUtcTodayCivilDate(now), '2026-10-02');
  assert.equal(date.isFutureCivilDate('2026-10-03', now), true);
  assert.equal(date.isFutureCivilDate('2026-10-02', now), false);

  const screen = fs.readFileSync(path.resolve(__dirname, '../src/features/profile/screens/ProfileScreen.tsx'), 'utf8');
  assert.match(screen, /setDraftBirthDate\(profile\.birthDate\)/);
  assert.match(screen, /birthDate: draftBirthDate/);
  assert.match(screen, /maximumDate=\{getUtcTodayPickerDate\(\)\}/);
  assert.match(screen, /isFutureCivilDate\(draftBirthDate\)/);
  assert.match(screen, /<ScrollView contentContainerStyle=\{styles\.editScroll\} keyboardShouldPersistTaps=/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const element = (type, props) => ({ type, props });
const renderElement = (type, props) => typeof type === 'function' ? type(props) : element(type, props);
const jsx = { jsx: renderElement, jsxs: renderElement };
const tick = () => new Promise((resolve) => setImmediate(resolve));

function load(relative, dependencies) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, exports) {${output}\n})`, { AbortController, URL })((name) => {
    if (name in dependencies) return dependencies[name];
    if (name === '../../../../assets/robo-onboarding.png' || name === '../../../../assets/icon.png') return name;
    throw new Error(`Unexpected import: ${name}`);
  }, module, module.exports);
  return module.exports;
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}

function textOf(node) {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  const children = node.props?.children;
  return (Array.isArray(children) ? children : [children]).map(textOf).join('');
}

function harness({ failSave = false, failSkip = false, windowHeight = 780, fontScale = 1, existingName = null, platform = 'android' } = {}) {
  const slots = [];
  const requests = [];
  const completions = [];
  const routes = [];
  const datePickerCalls = [];
  const alerts = [];
  let skipCalls = 0;
  let slot = 0;
  let onHardwareBack;
  const profile = {
    preferredName: existingName, birthDate: null, age: null, englishLevel: null, learningGoal: null,
    avatarType: 'PREDEFINED', avatarKey: 'avatar_default', onboardingCompleted: false,
    onboardingStatus: 'PENDING', initialSetupCompleted: false,
    createdAt: '', updatedAt: '',
  };
  const catalog = load('src/i18n/translations.ts', {}).translations;
  const React = {
    useState(initial) {
      const index = slot++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = slot++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useEffect(effect) { slot++; effect(); },
  };
  const Screen = load('src/features/auth/screens/InitialProfileSetupScreen.tsx', {
    '../../../theme/useThemedStyles': { useThemedStyles: (styles) => styles },
    '../../../components/ArtworkSoftener': { ArtworkSoftener: 'ArtworkSoftener' },
    '../../../theme/ThemeProvider': { useTheme: () => ({ colors: { accentText: '#5147df', text: '#171528', placeholder: '#8a8fa2' } }) },
    react: React,
    'react/jsx-runtime': jsx,
    'react-native': {
      Alert: { alert: (...args) => alerts.push(args) },
      BackHandler: { addEventListener: (_event, callback) => { onHardwareBack = callback; return { remove() {} }; } },
      Image: 'Image', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: platform }, Pressable: 'Pressable',
      ScrollView: 'ScrollView', StyleSheet: { create: (value) => value }, Text: 'Text', TextInput: 'TextInput', View: 'View',
      useWindowDimensions: () => ({ height: windowHeight, fontScale }),
    },
    'expo-router': { router: { replace: (route) => routes.push(route) } },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    '../../../config/api': { API_URL: 'http://localhost:8080' },
    'expo-symbols': { SymbolView: 'SymbolView' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@react-native-community/datetimepicker': {
      default: 'DateTimePicker',
      DateTimePickerAndroid: { open: (options) => datePickerCalls.push(options) },
    },
    '../../profile/profile.service': {
      completeInitialSetup: async (request) => { requests.push(request); if (failSave) throw new Error('network'); return { ...profile, ...request, initialSetupCompleted: true }; },
      getPredefinedAvatars: async () => Array.from({ length: 6 }, (_value, index) => ({ key: `avatar_0${index + 1}`, displayName: `Avatar ${index + 1}`, imageUrl: `/avatars/avatar_0${index + 1}/image` })),
      skipInitialSetup: async () => { skipCalls++; if (failSkip) throw new Error('network'); return { ...profile, initialSetupCompleted: true }; },
    },
    '../../profile/profile.date': {
      formatCivilDate: (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
      getUtcTodayPickerDate: () => new Date(2026, 9, 6, 12),
      isFutureCivilDate: (date) => date > '2026-10-06',
      parseCivilDate: (value) => value ? new Date(`${value}T12:00:00`) : null,
    },
    '../auth-navigation': { useAuthNavigation: () => ({ profile, completeInitialSetup: (saved) => completions.push(saved) }) },
    '../auth.session': { logoutSession: async () => {} },
    '../../../i18n': { useI18n: () => ({ t: (key, params = {}) => catalog[key].replace(/\{(\w+)\}/g, (_match, name) => String(params[name] ?? '')) }) },
  }).InitialProfileSetupScreen;
  return {
    requests, completions, routes, alerts, nextLabel: catalog['common.next'],
    get skipCalls() { return skipCalls; },
    datePickerCalls,
    chooseBirthDate(date) { datePickerCalls.at(-1)?.onValueChange(null, date); },
    confirmSkip() { const buttons = alerts.at(-1)?.[2] ?? []; buttons.find((button) => button.style === 'destructive')?.onPress(); },
    render() { slot = 0; return Screen(); },
    back() { return onHardwareBack(); },
  };
}

function pressText(tree, label) {
  const target = find(tree, (node) => node.type === 'Pressable' && textOf(node) === label);
  assert.ok(target, `Missing action: ${label}`);
  target.props.onPress();
}

function select(tree, label) {
  const target = find(tree, (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === label);
  const labels = [];
  const collect = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'Pressable' && node.props.accessibilityRole === 'radio') labels.push(node.props.accessibilityLabel);
    const children = node.props?.children;
    for (const child of Array.isArray(children) ? children : [children]) collect(child);
  };
  collect(tree);
  assert.ok(target, `Missing option: ${label}; found: ${labels.join(', ')}`);
  target.props.onPress();
}

async function fillAndReachSummary(flow) {
  let tree = flow.render();
  assert.match(textOf(tree), /Vamos configurar/);
  const logo = find(tree, (node) => node.type === 'Image' && node.props.source === '../../../../assets/icon.png');
  assert.ok(logo);
  const robot = find(tree, (node) => node.type === 'Image' && node.props.source === '../../../../assets/robo-onboarding.png');
  assert.equal(robot?.props.source, '../../../../assets/robo-onboarding.png');
  pressText(tree, 'Próximo');
  tree = flow.render();
  const name = find(tree, (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Nome');
  assert.ok(name);
  name.props.onChangeText('  Vitor Lima  ');
  pressText(flow.render(), 'Próximo');
  tree = flow.render();
  const birthDate = find(tree, (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Data de nascimento');
  assert.ok(birthDate);
  birthDate.props.onPress();
  assert.equal(flow.datePickerCalls.at(-1).mode, 'date');
  assert.equal(flow.datePickerCalls.at(-1).maximumDate.getFullYear(), 2026);
  flow.chooseBirthDate(new Date(2000, 7, 15, 12));
  tree = flow.render();
  pressText(tree, 'Próximo');
  tree = flow.render();
  assert.match(textOf(tree), /nível de inglês/);
  select(tree, 'A1 · Iniciante');
  pressText(flow.render(), 'Próximo');
  tree = flow.render();
  select(tree, 'Conversação');
  pressText(flow.render(), 'Próximo');
  await tick();
  tree = flow.render();
  select(tree, 'Avatar 1');
  pressText(flow.render(), flow.nextLabel);
  tree = flow.render();
  assert.match(textOf(tree), /Tudo pronto!/);
  assert.match(textOf(tree), /Vitor Lima/);
  assert.match(textOf(tree), /A1 · Iniciante/);
  assert.match(textOf(tree), /Conversação/);
  assert.doesNotMatch(textOf(tree), /Idioma do aplicativo|Português|Usar o app em inglês/);
  assert.equal(find(tree, (node) => node.props?.accessibilityLabel === 'Etapa 7 de 7') !== null, true);
  assert.equal(flow.back(), true);
  assert.match(textOf(flow.render()), /avatar/i);
  const selectedAvatar = find(flow.render(), (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'radio' && node.props.accessibilityLabel === 'Avatar 1');
  assert.equal(selectedAvatar?.props.accessibilityState.selected, true);
  pressText(flow.render(), 'Próximo');
  return flow.render();
}

test('initial profile setup saves account settings once and enters Home only after success', async () => {
  const flow = harness();
  const summary = await fillAndReachSummary(flow);
  assert.equal(flow.requests.length, 0);
  pressText(summary, 'Começar a aprender');
  await tick();

  assert.deepEqual(JSON.parse(JSON.stringify(flow.requests)), [{ name: 'Vitor Lima', birthDate: '2000-08-15', englishLevel: 'A1', learningGoal: 'CONVERSATION', avatarKey: 'avatar_01' }]);
  assert.equal(flow.completions.length, 1);
  assert.equal(flow.completions[0].initialSetupCompleted, true);
  assert.deepEqual(flow.routes, ['/']);
});

test('failed setup save keeps the user in the wizard without marking completion', async () => {
  const flow = harness({ failSave: true });
  const summary = await fillAndReachSummary(flow);
  pressText(summary, 'Começar a aprender');
  await tick();

  assert.equal(flow.requests.length, 1);
  assert.equal(flow.completions.length, 0);
  assert.deepEqual(flow.routes, []);
  assert.match(textOf(flow.render()), /Não foi possível salvar suas preferências/);
});

test('skip persists completion before navigating Home and ignores repeated taps', async () => {
  const flow = harness();
  const skip = find(flow.render(), (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Pular');
  assert.ok(skip);
  skip.props.onPress();
  assert.equal(flow.alerts.length, 1);
  flow.confirmSkip();
  flow.confirmSkip();
  await tick();
  assert.equal(flow.skipCalls, 1);
  assert.equal(flow.completions.length, 1);
  assert.equal(flow.completions[0].initialSetupCompleted, true);
  assert.deepEqual(flow.routes, ['/']);
});

test('skip network failure stays in setup and does not update local completion', async () => {
  const flow = harness({ failSkip: true });
  find(flow.render(), (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Pular').props.onPress();
  flow.confirmSkip();
  await tick();
  assert.equal(flow.skipCalls, 1);
  assert.equal(flow.completions.length, 0);
  assert.deepEqual(flow.routes, []);
  assert.match(textOf(flow.render()), /pular agora/);
});

test('setup service rejects a successful HTTP response without persisted completion', async () => {
  const request = { name: 'Vitor Lima', birthDate: '2000-08-15', englishLevel: 'A1', learningGoal: 'CONVERSATION', avatarKey: 'avatar_01' };
  const profile = {
    preferredName: null, birthDate: request.birthDate, age: 26, englishLevel: request.englishLevel,
    learningGoal: request.learningGoal, avatarType: 'PREDEFINED', avatarKey: 'avatar_default',
    onboardingCompleted: false, onboardingStatus: 'PENDING',
    initialSetupCompleted: false, createdAt: '', updatedAt: '',
  };
  const service = load('src/features/profile/profile.service.ts', {
    '../../api/authenticated-fetch': { authenticatedFetch: async () => ({ ok: true, json: async () => profile }) },
  });
  await assert.rejects(service.completeInitialSetup(request), { name: 'ProfileUpdateError' });
});

test('skip profile service uses the authenticated skip endpoint and requires Backend completion', async () => {
  const calls = [];
  const profile = {
    preferredName: null, birthDate: null, age: null, englishLevel: null, learningGoal: null,
    avatarType: 'PREDEFINED', avatarKey: 'avatar_default', onboardingCompleted: false,
    onboardingStatus: 'PENDING', initialSetupCompleted: true, createdAt: '', updatedAt: '',
  };
  const service = load('src/features/profile/profile.service.ts', {
    '../../api/authenticated-fetch': { authenticatedFetch: async (...args) => { calls.push(args); return { ok: true, json: async () => profile }; } },
  });
  const saved = await service.skipInitialSetup();
  assert.equal(saved.initialSetupCompleted, true);
  assert.equal(calls[0][0], '/api/v1/users/me/profile/initial-setup/skip');
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].body, undefined);
});

test('short screens use compact level cards while larger screens keep their descriptions', () => {
  function reachLevel(flow) {
    pressText(flow.render(), 'Próximo');
    const name = find(flow.render(), (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Nome');
    name.props.onChangeText('Ana');
    pressText(flow.render(), 'Próximo');
    const input = find(flow.render(), (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Data de nascimento');
    input.props.onPress();
    flow.chooseBirthDate(new Date(2000, 7, 15, 12));
    pressText(flow.render(), 'Próximo');
    return textOf(flow.render());
  }
  assert.doesNotMatch(reachLevel(harness({ windowHeight: 720 })), /Estou começando agora/);
  assert.match(reachLevel(harness({ windowHeight: 900 })), /Estou começando agora/);
});

test('existing account name is prefilled when setup is reopened', () => {
  const flow = harness({ existingName: 'Ana Silva' });
  pressText(flow.render(), 'Próximo');
  const input = find(flow.render(), (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Nome');
  assert.equal(input?.props.value, 'Ana Silva');
});

test('name field is compact and uses a full-name placeholder', () => {
  const flow = harness();
  pressText(flow.render(), 'Próximo');
  const tree = flow.render();
  const input = find(tree, (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Nome');
  assert.equal(input?.props.placeholder, 'Nome completo');
  assert.equal(input?.props.style.fontSize, 16);
  assert.doesNotMatch(textOf(tree), /Vitor Lima/);
});

test('iOS setup opens the inline calendar instead of a free-form date field', () => {
  const flow = harness({ platform: 'ios' });
  pressText(flow.render(), 'Próximo');
  const nameInput = find(flow.render(), (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Nome');
  nameInput.props.onChangeText('Ana Silva');
  pressText(flow.render(), 'Próximo');
  const dateAction = find(flow.render(), (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Data de nascimento');
  assert.ok(dateAction);
  assert.equal(find(flow.render(), (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Data de nascimento'), null);
  dateAction.props.onPress();
  assert.ok(find(flow.render(), (node) => node.props?.mode === 'date' && node.props?.maximumDate));
});

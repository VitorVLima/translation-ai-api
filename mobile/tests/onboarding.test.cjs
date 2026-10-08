const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const element = (type, props) => ({ type, props });
const jsx = { jsx: element, jsxs: element };
const tick = () => new Promise((resolve) => setImmediate(resolve));

function load(relative, dependencies) {
  const output = ts.transpileModule(read(relative), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, exports) {${output}\n})`)((name) => {
    if (name.endsWith('/theme/useThemedStyles')) return { useThemedStyles: (styles) => styles };
    if (name in dependencies) return dependencies[name];
    if (name.startsWith('../../../../assets/onboarding-')) return name;
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

function button(tree, label) {
  const found = find(tree, (node) => node.type === 'Pressable' && (node.props.accessibilityLabel === label || textOf(node) === label));
  assert.ok(found, `Missing button: ${label}`);
  return found;
}

function screenHarness() {
  const slots = [];
  const destinations = [];
  const scrollCalls = [];
  const storageWrites = [];
  let slot = 0;
  let hardwareBack;
  let writeError = false;
  const React = {
    useState(initial) {
      const index = slot++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) {
      const index = slot++;
      if (!(index in slots)) slots[index] = { current: index === 0 ? { scrollToIndex: (target) => scrollCalls.push(target) } : initial };
      return slots[index];
    },
    useCallback(fn) { slot++; return fn; },
    useEffect(effect) { slot++; effect(); },
  };
  const Screen = load('src/features/auth/screens/OnboardingScreen.tsx', {
    react: React,
    '../../../components/ArtworkSoftener': { ArtworkSoftener: 'ArtworkSoftener' },
    '../../../theme/ThemeProvider': { useTheme: () => ({ colors: { text: '#171528' } }) },
    'react/jsx-runtime': jsx,
    'expo-router': { router: { replace: (destination) => destinations.push(destination) } },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'expo-symbols': { SymbolView: 'SymbolView' },
    '../onboarding-preference.storage': { async setOnboardingHidden(value) { storageWrites.push(value); if (writeError) throw new Error('storage'); } },
    'react-native': {
      BackHandler: { addEventListener: (_name, callback) => { hardwareBack = callback; return { remove() {} }; } },
      FlatList: 'FlatList', Image: 'Image', Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
      StyleSheet: { create: (styles) => styles },
      useWindowDimensions: () => ({ width: 360, height: 740 }),
    },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ top: 24, bottom: 32, left: 0, right: 0 }) },
  }).OnboardingScreen;
  return {
    destinations, scrollCalls, storageWrites,
    render() { slot = 0; return Screen(); },
    androidBack() { return hardwareBack(); },
    failStorage() { writeError = true; },
  };
}

function authProviderHarness(result, session, preference = false, profile = { initialSetupCompleted: true }) {
  const slots = [];
  let slot = 0;
  let started = false;
  let invalidation;
  const context = { value: null };
  const React = {
    createContext: () => context,
    useContext: () => context.value,
    useState(initial) {
      const index = slot++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = value; }];
    },
    useEffect(effect) { slot++; if (!started) { started = true; effect(); } },
  };
  const auth = load('src/features/auth/auth-navigation.tsx', {
    react: React,
    'react/jsx-runtime': jsx,
    './auth.session': {
      getSession: () => session,
      restoreSession: async () => result,
      subscribeToSessionInvalidation: (listener) => { invalidation = listener; return () => {}; },
    },
    './onboarding-preference.storage': { getOnboardingHidden: () => Promise.resolve(preference) },
    '../profile/profile.service': { getProfile: async () => profile },
  });
  return {
    render() {
      slot = 0;
      const tree = auth.AuthNavigationProvider({ children: 'routes' });
      context.value = tree.props.value;
      return tree.props.value;
    },
    invalidate() { invalidation(); },
  };
}

test('session restoration chooses Home or onboarding only after auth resolves', async () => {
  const authenticated = authProviderHarness({ status: 'authenticated' }, { user: { id: 'one' } });
  assert.equal(authenticated.render().status, 'restoring');
  await tick();
  assert.equal(authenticated.render().status, 'authenticated');
  assert.equal(authenticated.render().privateEntry, 'app');

  const incompleteProfile = authProviderHarness({ status: 'authenticated' }, { user: { id: 'two' } }, false,
    { initialSetupCompleted: false });
  incompleteProfile.render();
  await tick();
  assert.equal(incompleteProfile.render().status, 'authenticated');
  assert.equal(incompleteProfile.render().privateEntry, 'initial-setup');

  const unauthenticated = authProviderHarness({ status: 'unauthenticated' }, null);
  assert.equal(unauthenticated.render().status, 'restoring');
  await tick();
  assert.equal(unauthenticated.render().status, 'unauthenticated');
  assert.equal(unauthenticated.render().publicEntry, 'onboarding');

  const hidden = authProviderHarness({ status: 'unauthenticated' }, null, true);
  assert.equal(hidden.render().status, 'restoring');
  await tick();
  assert.equal(hidden.render().status, 'unauthenticated');
  assert.equal(hidden.render().publicEntry, 'login');

  authenticated.invalidate();
  assert.equal(authenticated.render().status, 'unauthenticated');
  assert.equal(authenticated.render().publicEntry, 'login');
});

test('bootstrap waits for both session and preference; read failure defaults to onboarding', async () => {
  let resolvePreference;
  const pendingPreference = new Promise((resolve) => { resolvePreference = resolve; });
  const pending = authProviderHarness({ status: 'unauthenticated' }, null, pendingPreference);
  assert.equal(pending.render().status, 'restoring');
  await tick();
  assert.equal(pending.render().status, 'restoring');
  resolvePreference(true);
  await tick();
  assert.equal(pending.render().publicEntry, 'login');
  assert.equal(pending.render().status, 'unauthenticated');

  let resolveSession;
  const pendingSession = new Promise((resolve) => { resolveSession = resolve; });
  const restoring = authProviderHarness(pendingSession, null, false);
  assert.equal(restoring.render().status, 'restoring');
  await tick();
  assert.equal(restoring.render().status, 'restoring');
  resolveSession({ status: 'unauthenticated' });
  await tick();
  assert.equal(restoring.render().publicEntry, 'onboarding');
  assert.equal(restoring.render().status, 'unauthenticated');

  const failed = authProviderHarness({ status: 'unauthenticated' }, null, Promise.reject(new Error('storage')));
  assert.equal(failed.render().status, 'restoring');
  await tick();
  assert.equal(failed.render().status, 'unauthenticated');
  assert.equal(failed.render().publicEntry, 'onboarding');

  const signedIn = authProviderHarness({ status: 'authenticated' }, { user: { id: 'one' } }, Promise.reject(new Error('storage')));
  signedIn.render();
  await tick();
  assert.equal(signedIn.render().status, 'authenticated');

  let resolveDelayedSession;
  const delayedSession = new Promise((resolve) => { resolveDelayedSession = resolve; });
  const invalidated = authProviderHarness(delayedSession, null, false);
  assert.equal(invalidated.render().status, 'restoring');
  invalidated.invalidate();
  assert.equal(invalidated.render().status, 'restoring');
  resolveDelayedSession({ status: 'unauthenticated' });
  await tick();
  assert.equal(invalidated.render().status, 'unauthenticated');
  assert.equal(invalidated.render().publicEntry, 'login');
});

test('restoration gates all routes; authenticated users have no onboarding guard', () => {
  const rootLayout = read('app/_layout.tsx');
  assert.doesNotMatch(rootLayout, /expo-navigation-bar|<NavigationBar\b/);
  assert.match(rootLayout, /export default function RootLayout\(/);
  let status = 'restoring';
  let publicEntry = 'onboarding';
  const splash = { prevented: 0, hidden: 0 };
  const Stack = function Stack() {};
  Stack.Protected = 'Protected';
  Stack.Screen = 'Screen';
  const layout = load('app/_layout.tsx', {
    react: { useEffect: (effect) => effect() },
    'react/jsx-runtime': jsx,
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'expo-router': { Stack, SplashScreen: { preventAutoHideAsync: () => { splash.prevented++; }, hideAsync: () => { splash.hidden++; } } },
    '../src/theme/ThemeProvider': { ThemeProvider: 'ThemeProvider', useTheme: () => ({ colors: { background: '#f8f9ff' }, resolved: 'light' }) },
    '../src/features/auth/auth-navigation': { AuthNavigationProvider: 'Provider', useAuthNavigation: () => ({ status, publicEntry, privateEntry: 'app', retryProfileLoad() {} }) },
    '../src/features/auth/screens/ProfileBootstrapErrorScreen': { ProfileBootstrapErrorScreen: 'ProfileBootstrapErrorScreen' },
  });
  assert.equal(splash.prevented, 1);
  assert.equal(layout.AuthenticatedRoutes, undefined);
  const provider = layout.default();
  assert.equal(provider.type, 'ThemeProvider');
  assert.equal(provider.props.children.type, 'Provider');
  const routes = provider.props.children.props.children.type;
  assert.equal(routes(), null);
  assert.equal(splash.hidden, 0);

  status = 'authenticated';
  let tree = routes();
  let guards = tree.props.children[1].props.children;
  assert.deepEqual(Array.from(guards, (guard) => guard.props.guard), [false, false, false, true]);
  assert.equal(splash.hidden, 1);

  status = 'unauthenticated';
  tree = routes();
  guards = tree.props.children[1].props.children;
  assert.deepEqual(Array.from(guards, (guard) => guard.props.guard), [true, true, false, false]);
  assert.equal(guards[0].props.children.props.name, 'onboarding');
  publicEntry = 'login';
  guards = routes().props.children[1].props.children;
  assert.deepEqual(Array.from(guards, (guard) => guard.props.guard), [false, true, false, false]);
});

test('onboarding supports button, swipe, progress, Android Back and replace to Login', () => {
  const flow = screenHarness();
  let tree = flow.render();
  const list = find(tree, (node) => node.type === 'FlatList');
  assert.equal(list.props.data.length, 4);
  const titles = ['Aprenda inglês', 'Converse e pratique', 'Expanda seu vocabulário', 'Pratique todos os dias'];
  for (const [index, page] of list.props.data.entries()) {
    const asset = `../../../../assets/onboarding-${index + 1}.png`;
    assert.equal(page.image, asset);
    const content = list.props.renderItem({ item: page });
    const image = find(content, (node) => node.type === 'Image');
    assert.equal(image.props.source, asset);
    assert.equal(image.props.resizeMode, 'contain');
    assert.match(textOf(content), new RegExp(titles[index]));
  }
  assert.equal(list.props.horizontal, true);
  assert.equal(list.props.pagingEnabled, true);
  const safeArea = find(tree, (node) => node.type === 'SafeAreaView');
  assert.equal(safeArea.props.edges.includes('bottom'), true);
  const footer = safeArea.props.children[2];
  assert.ok(find(footer, (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Não mostrar novamente'));
  assert.equal(find(tree, (node) => node.props?.accessibilityLabel === 'Página 1 de 4') !== null, true);
  assert.ok(button(tree, 'Pular'));
  assert.equal(find(tree, (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Página anterior'), null);
  assert.equal(flow.androidBack(), false);
  button(tree, 'Próxima página').props.onPress();
  assert.equal(flow.scrollCalls.at(-1).index, 1);

  tree = flow.render();
  assert.ok(find(tree, (node) => node.props?.accessibilityLabel === 'Página 2 de 4'));
  assert.ok(button(tree, 'Pular'));
  assert.ok(button(tree, 'Página anterior'));
  assert.ok(button(tree, 'Voltar à página anterior'));
  assert.equal(flow.androidBack(), true);
  assert.equal(flow.scrollCalls.at(-1).index, 0);
  tree = flow.render();
  const listAgain = find(tree, (node) => node.type === 'FlatList');
  listAgain.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 720 } } });
  tree = flow.render();
  assert.ok(find(tree, (node) => node.props?.accessibilityLabel === 'Página 3 de 4'));
  assert.ok(button(tree, 'Pular'));
  button(tree, 'Voltar à página anterior').props.onPress();
  assert.equal(flow.scrollCalls.at(-1).index, 1);
  tree = flow.render();
  button(tree, 'Próxima página').props.onPress();
  tree = flow.render();
  button(tree, 'Próxima página').props.onPress();
  tree = flow.render();
  assert.ok(find(tree, (node) => node.props?.accessibilityLabel === 'Página 4 de 4'));
  assert.ok(button(tree, 'Página anterior'));
  assert.equal(find(tree, (node) => node.type === 'Pressable' && textOf(node) === 'Pular'), null);
  button(tree, 'Começar').props.onPress();
  assert.deepEqual(flow.destinations, ['/login']);
  assert.deepEqual(flow.storageWrites, []);
});

test('Pular without checking never persists, so a logged-out restart returns to onboarding', async () => {
  const flow = screenHarness();
  const tree = flow.render();
  assert.equal(button(tree, 'Não mostrar novamente').props.accessibilityState.checked, false);
  button(tree, 'Pular').props.onPress();
  assert.deepEqual(flow.destinations, ['/login']);
  assert.deepEqual(flow.storageWrites, []);
  const reopened = authProviderHarness({ status: 'unauthenticated' }, null, false);
  assert.equal(reopened.render().status, 'restoring');
  await tick();
  assert.equal(reopened.render().publicEntry, 'onboarding');
  assert.match(read('src/features/auth/screens/LoginScreen.tsx'), /completeLogin\(\)/);
  assert.match(read('src/features/profile/screens/ProfileScreen.tsx'), /router\.replace\('\/login'\)/);
  assert.doesNotMatch(read('src/features/profile/screens/ProfileScreen.tsx'), /setOnboardingHidden/);
});

test('checked preference persists before Pular or Começar; failed write stays on onboarding', async () => {
  const skipped = screenHarness();
  let tree = skipped.render();
  button(tree, 'Não mostrar novamente').props.onPress();
  tree = skipped.render();
  assert.equal(button(tree, 'Não mostrar novamente').props.accessibilityState.checked, true);
  button(tree, 'Pular').props.onPress();
  await tick();
  assert.deepEqual(skipped.storageWrites, [true]);
  assert.deepEqual(skipped.destinations, ['/login']);
  const reopened = authProviderHarness({ status: 'unauthenticated' }, null, true);
  reopened.render();
  await tick();
  assert.equal(reopened.render().publicEntry, 'login');

  const started = screenHarness();
  tree = started.render();
  button(tree, 'Não mostrar novamente').props.onPress();
  const list = find(tree, (node) => node.type === 'FlatList');
  list.props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 1080 } } });
  tree = started.render();
  button(tree, 'Começar').props.onPress();
  await tick();
  assert.deepEqual(started.storageWrites, [true]);
  assert.deepEqual(started.destinations, ['/login']);

  const failed = screenHarness();
  failed.failStorage();
  tree = failed.render();
  button(tree, 'Não mostrar novamente').props.onPress();
  tree = failed.render();
  button(tree, 'Pular').props.onPress();
  await tick();
  tree = failed.render();
  assert.deepEqual(failed.destinations, []);
  assert.match(textOf(tree), /Não foi possível salvar sua preferência/);
  button(tree, 'Não mostrar novamente').props.onPress();
  tree = failed.render();
  button(tree, 'Pular').props.onPress();
  assert.deepEqual(failed.destinations, ['/login']);
});

test('local preference uses one separate key and can be cleared later', async () => {
  const values = new Map();
  const storage = load('src/features/auth/onboarding-preference.storage.ts', {
    'expo-secure-store': {
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => { values.set(key, value); },
      deleteItemAsync: async (key) => { values.delete(key); },
    },
  });
  assert.equal(await storage.getOnboardingHidden(), false);
  await storage.setOnboardingHidden(true);
  assert.deepEqual(Array.from(values.entries()), [['englishai.onboarding.hidden', 'true']]);
  assert.equal(await storage.getOnboardingHidden(), true);
  await storage.setOnboardingHidden(false);
  assert.equal(await storage.getOnboardingHidden(), false);
});

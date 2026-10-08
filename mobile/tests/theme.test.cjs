const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relative, dependencies) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, exports) {${compiled}\n})`)((name) => {
    if (name in dependencies) return dependencies[name];
    throw Error(`Unexpected import: ${name}`);
  }, module, module.exports);
  return module.exports;
}

const palette = load('src/theme/theme.ts', {});

test('decorative artwork is softened only in dark mode without intercepting touches', () => {
  let resolved = 'light';
  const { ArtworkSoftener } = load('src/components/ArtworkSoftener.tsx', {
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'react-native': { StyleSheet: { absoluteFill: { position: 'absolute' }, create: (value) => value }, View: 'View' },
    '../theme/ThemeProvider': { useTheme: () => ({ resolved }) },
  });
  assert.equal(ArtworkSoftener(), null);
  resolved = 'dark';
  const overlay = ArtworkSoftener();
  assert.equal(overlay.props.pointerEvents, 'none');
  assert.equal(overlay.props.style.backgroundColor, 'rgba(24, 28, 54, 0.14)');
});

test('shared Back icon follows the active surface text color', () => {
  let colors = palette.themeColors.light;
  const jsx = (type, props) => ({ type, props });
  const { ScreenHeader } = load('src/components/ScreenHeader.tsx', {
    '../theme/useThemedStyles': { useThemedStyles: (styles) => styles },
    '../theme/ThemeProvider': { useTheme: () => ({ colors }) },
    '../i18n': { useI18n: () => ({ t: () => 'Voltar' }) },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Pressable: 'Pressable', StyleSheet: { create: (value) => value }, Text: 'Text', View: 'View' },
    'expo-symbols': { SymbolView: 'SymbolView' },
  });
  const iconColor = () => ScreenHeader({ title: 'Leitura', onBack() {} }).props.children[0].props.children.props.tintColor;
  assert.equal(iconColor(), palette.themeColors.light.text);
  colors = palette.themeColors.dark;
  assert.equal(iconColor(), palette.themeColors.dark.text);
});

test('system is default; explicit choices override the device and system follows changes', () => {
  assert.equal(palette.resolveTheme('system', null), 'light');
  assert.equal(palette.resolveTheme('system', 'dark'), 'dark');
  assert.equal(palette.resolveTheme('system', 'light'), 'light');
  assert.equal(palette.resolveTheme('light', 'dark'), 'light');
  assert.equal(palette.resolveTheme('dark', 'light'), 'dark');
});

test('local theme preference persists independently of the session', async () => {
  const values = new Map();
  const storage = load('src/theme/theme.storage.ts', {
    'expo-secure-store': {
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => { values.set(key, value); },
    },
    'react-native': { Platform: { OS: 'android' } },
  });
  assert.equal(await storage.loadThemePreference(), 'system');
  await storage.saveThemePreference('dark');
  assert.equal(await storage.loadThemePreference(), 'dark');
  values.set('englishai.theme.preference', 'invalid');
  assert.equal(await storage.loadThemePreference(), 'system');
});

test('old Dark/System preferences and Android dark resolve to Light while alternatives are gated', async () => {
  for (const stored of [null, 'dark', 'system']) {
    for (const system of ['light', 'dark']) {
  const slots = [];
  const effectDeps = [];
  const effects = [];
  const nativeChanges = [];
  const values = new Map();
  if (stored) values.set('englishai.theme.preference', stored);
  let slot = 0;
  const equal = (left, right) => left && right && left.length === right.length && left.every((item, index) => item === right[index]);
  const React = {
    createContext: () => ({ Provider: 'ThemeContextProvider' }),
    useState(initial) { const index = slot++; if (!(index in slots)) slots[index] = initial; return [slots[index], (value) => { slots[index] = value; }]; },
    useEffect(effect, deps) { const index = slot++; if (!equal(effectDeps[index], deps)) { effectDeps[index] = deps; effects.push(effect); } },
    useCallback(callback) { slot++; return callback; },
    useMemo(factory) { slot++; return factory(); },
  };
  const storage = load('src/theme/theme.storage.ts', {
    'expo-secure-store': {
      getItemAsync: async (key) => values.get(key) ?? null,
      setItemAsync: async (key, value) => { values.set(key, value); },
    },
    'react-native': { Platform: { OS: 'android' } },
  });
  const { ThemeProvider } = load('src/theme/ThemeProvider.tsx', {
    react: React,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    'react-native': { Appearance: { setColorScheme: (value) => nativeChanges.push(value) }, useColorScheme: () => system },
    './theme': palette,
    './theme.storage': storage,
  });
  function render() { slot = 0; const node = ThemeProvider({ children: 'same child' }); for (const effect of effects.splice(0)) effect(); return node; }
  assert.equal(render(), null);
  await new Promise((resolve) => setImmediate(resolve));
  const node = render();
  assert.equal(node.props.value.preference, 'light');
  assert.equal(node.props.value.resolved, 'light');
  assert.equal(node.props.value.colors.background, palette.themeColors.light.background);
  assert.equal(node.props.children, 'same child');
  await node.props.value.setPreference('dark');
  await node.props.value.setPreference('system');
  assert.equal(values.get('englishai.theme.preference') ?? null, stored);
  assert.deepEqual(nativeChanges, ['light']);
  await node.props.value.setPreference('light');
  assert.equal(values.get('englishai.theme.preference'), 'light');
  assert.equal(render().props.value.resolved, 'light');
    }
  }
});

test('Dark/System implementation remains available behind the product gate', () => {
  assert.equal(palette.isThemeOptionAvailable('light'), true);
  assert.equal(palette.isThemeOptionAvailable('dark'), false);
  assert.equal(palette.isThemeOptionAvailable('system'), false);
  assert.equal(palette.availableThemePreference('dark'), 'light');
  assert.equal(palette.availableThemePreference('system'), 'light');
  assert.equal(palette.resolveTheme('dark', 'light'), 'dark');
  assert.equal(palette.resolveTheme('system', 'dark'), 'dark');
  assert.ok(palette.themeColors.dark.background);
});

test('semantic roles keep text, cards, feedback and borders legible in dark mode', () => {
  const { adaptColor, useThemedStyles } = load('src/theme/useThemedStyles.ts', {
    react: { useMemo: (factory) => factory() },
    'react-native': { StyleSheet: { flatten: (value) => value } },
    './ThemeProvider': { useTheme: () => ({ colors: palette.themeColors.dark, resolved: 'dark' }) },
    './theme': palette,
  });
  const dark = palette.themeColors.dark;
  assert.equal(adaptColor('#f8f9ff', 'backgroundColor', dark), dark.background);
  assert.equal(adaptColor('#ffffff', 'backgroundColor', dark), dark.surface);
  assert.equal(adaptColor('#171528', 'color', dark), dark.text);
  assert.equal(adaptColor('#74798d', 'color', dark), dark.textSecondary);
  assert.equal(adaptColor('#e4e6ef', 'borderColor', dark), dark.border);
  assert.equal(adaptColor('#fff1f2', 'backgroundColor', dark), dark.errorSubtle);
  assert.equal(adaptColor('#e9f8f0', 'backgroundColor', dark), dark.successSubtle);
  assert.equal(adaptColor('#ffffff', 'color', dark), '#ffffff');
  const card = useThemedStyles({ card: { backgroundColor: '#ffffff', borderColor: '#e4e6ef' }, title: { color: '#171528' } });
  assert.equal(card.card.backgroundColor, dark.surface);
  assert.equal(card.card.borderColor, dark.border);
  assert.equal(card.title.color, dark.text);
});

test('Profile exposes Aparência and Initial Setup has no language step', () => {
  const profile = fs.readFileSync(path.resolve(__dirname, '../src/features/profile/screens/ProfileScreen.tsx'), 'utf8');
  const setup = fs.readFileSync(path.resolve(__dirname, '../src/features/auth/screens/InitialProfileSetupScreen.tsx'), 'utf8');
  assert.match(profile, /settings\.appearance/);
  assert.match(profile, /\['light', 'dark', 'system'\]/);
  assert.match(profile, /disabled=\{isSavingTheme \|\| !available\}/);
  assert.match(profile, /accessibilityState=\{\{ selected: preference === option, disabled: isSavingTheme \|\| !available \}\}/);
  assert.match(profile, /settings\.comingSoon/);
  assert.doesNotMatch(profile, /preferredLanguage|setLanguage|Idioma do aplicativo/);
  assert.doesNotMatch(setup, /preferredLanguage|setLanguage|Idioma do aplicativo/);
});

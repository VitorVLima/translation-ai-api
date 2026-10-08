const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function renderPublicAuthScreen({ top, bottom, platform = 'android' }) {
  const output = ts.transpileModule(read('src/features/auth/components/PublicAuthScreen.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  const imports = (name) => {
      if (name === '../../../theme/useThemedStyles') return { useThemedStyles: (styles) => styles };
      if (name === 'react/jsx-runtime') return {
        jsx: (type, props) => ({ type, props }),
        jsxs: (type, props) => ({ type, props }),
      };
      if (name === 'react-native') return {
        KeyboardAvoidingView: 'KeyboardAvoidingView',
        ScrollView: 'ScrollView',
        Platform: { OS: platform },
        StyleSheet: { create: (styles) => styles },
      };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top, bottom }) };
      throw new Error(`Unexpected import: ${name}`);
  };
  const execute = vm.runInNewContext(`(function(require, module, exports) {${output}\n})`);
  execute(imports, module, module.exports);
  return module.exports.PublicAuthScreen({
    children: 'last action',
    contentContainerStyle: { flexGrow: 1 },
    topSpacing: 16,
    bottomSpacing: 28,
  });
}

test('public auth scroll content adds real top and bottom insets to existing spacing', () => {
  for (const bottom of [0, 24, 48]) {
    const view = renderPublicAuthScreen({ top: 20, bottom });
    assert.equal(view.type, 'KeyboardAvoidingView');
    assert.equal(view.props.behavior, 'height');
    const scroll = view.props.children;
    assert.equal(scroll.type, 'ScrollView');
    assert.equal(scroll.props.contentContainerStyle[1].paddingTop, 36);
    assert.equal(scroll.props.contentContainerStyle[1].paddingBottom, 28 + bottom);
    assert.equal(scroll.props.children, 'last action');
    assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
  }
  const ios = renderPublicAuthScreen({ top: 0, bottom: 34, platform: 'ios' });
  assert.equal(ios.props.behavior, 'padding');
  assert.equal(ios.props.children.props.contentContainerStyle[1].paddingBottom, 62);
});

test('all public auth screens use the same scroll and keyboard wrapper', () => {
  for (const name of ['LoginScreen', 'RegisterScreen', 'PasswordRecoveryScreen', 'EmailVerificationScreen']) {
    const screen = read(`src/features/auth/screens/${name}.tsx`);
    assert.match(screen, /<PublicAuthScreen\b/);
    assert.doesNotMatch(screen, /^\s*<ScrollView\b|^\s*<KeyboardAvoidingView\b/m);
  }
  for (const name of ['LoginScreen', 'RegisterScreen', 'PasswordRecoveryScreen']) {
    const screen = read(`src/features/auth/screens/${name}.tsx`);
    assert.match(screen, /scrollRef=\{scrollRef\}/);
  }
  const recovery = read('src/features/auth/screens/PasswordRecoveryScreen.tsx');
  assert.match(recovery, /phase === 'request'/);
  assert.match(recovery, /phase === 'code'/);
  assert.match(recovery, /phase === 'password'/);
});

test('standard Expo Router tabs retain five routes and size above the bottom inset', () => {
  const tabs = read('app/(app)/_layout.tsx');
  assert.match(tabs, /useSafeAreaInsets\(\)/);
  assert.match(tabs, /height: TAB_CONTENT_HEIGHT \+ insets\.bottom/);
  assert.match(tabs, /tabBarHideOnKeyboard: true/);
  assert.match(tabs, /tabBarActiveTintColor: colors\.accentText/);
  assert.match(tabs, /tabBarInactiveTintColor: colors\.textSecondary/);
  for (const name of ['index', 'practice', 'conversations', 'progress', 'profile']) {
    assert.match(tabs, new RegExp(`name="${name}"`));
  }
  for (const label of ['home', 'practice', 'conversations', 'progress', 'profile']) {
    assert.ok(tabs.includes(`tabBarLabel: t('navigation.${label}')`));
  }
});

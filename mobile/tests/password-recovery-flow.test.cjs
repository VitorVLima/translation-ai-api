const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));

function createScreen() {
  const calls = [];
  const navigation = [];
  const slots = [];
  let hook = 0;
  let validationError = null;
  let resetError = null;
  let hardwareBack = null;
  let now = Date.now();
  let nextTimer = 0;
  const intervals = new Map();
  class PasswordResetError extends Error {
    constructor(kind) { super(kind); this.kind = kind; }
  }
  const React = {
    useState(initial) {
      const index = hook++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], (next) => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef(initial) {
      const index = hook++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useCallback(callback) { hook++; return callback; },
    useEffect(effect) { hook++; effect(); },
  };
  const service = {
    PasswordResetError,
    async requestPasswordReset(request) { calls.push(['request', request]); },
    async validatePasswordResetCode(request) {
      calls.push(['validate', request]);
      if (validationError) throw new PasswordResetError(validationError);
    },
    async resetPassword(request) {
      calls.push(['reset', request]);
      if (resetError) throw new PasswordResetError(resetError);
    },
  };
  const element = (type, props) => ({ type, props });
  const dependencies = {
    react: React,
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    'expo-symbols': { SymbolView: 'SymbolView' },
    'expo-router': { router: { replace: (route) => navigation.push(route) }, useFocusEffect: (effect) => { hook++; effect(); } },
    'react-native': {
      BackHandler: { addEventListener: (_event, callback) => { hardwareBack = callback; return { remove() {} }; } },
      Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: (styles) => styles },
      Text: 'Text', TextInput: 'TextInput', View: 'View',
    },
    '../auth.service': service,
    '../components/PasswordRequirements': { PasswordRequirements: 'PasswordRequirements' },
    '../components/PublicAuthScreen': { PublicAuthScreen: 'PublicAuthScreen' },
    '../components/VerificationCodeInput': { VerificationCodeInput: 'VerificationCodeInput' },
    '../password-rules': { getPasswordError: (value) => value.length < 6 ? 'password-invalid' : '' },
  };
  const output = ts.transpileModule(read('src/features/auth/screens/PasswordRecoveryScreen.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  const execute = vm.runInNewContext(`(function(require, module, exports) {${output}\n})`, {
    setInterval: (callback) => { const timer = ++nextTimer; intervals.set(timer, callback); return timer; },
    clearInterval: (timer) => { intervals.delete(timer); },
    Date: { now: () => now },
  });
  execute((name) => {
    if (name.endsWith('/theme/useThemedStyles')) return { useThemedStyles: (styles) => styles };
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected import ${name}`);
  }, module, module.exports);
  return {
    calls, navigation,
    render() { hook = 0; return module.exports.PasswordRecoveryScreen(); },
    setValidationError(kind) { validationError = kind; },
    setResetError(kind) { resetError = kind; },
    advanceTime(ms) { now += ms; for (const callback of [...intervals.values()]) callback(); },
    pressAndroidBack() { assert.ok(hardwareBack); return hardwareBack(); },
  };
}

function visit(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = visit(child, predicate);
    if (found) return found;
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
  const found = visit(tree, (node) => node.type === 'Pressable' && textOf(node).includes(label));
  assert.ok(found, `Button ${label} should be visible`);
  return found;
}

function input(tree, label) {
  const found = visit(tree, (node) => node.type === 'TextInput' && node.props.accessibilityLabel === label);
  assert.ok(found, `Input ${label} should be visible`);
  return found;
}

test('recovery separates email, server validated code, password and success', async () => {
  const flow = createScreen();
  let tree = flow.render();
  assert.match(textOf(tree), /Recuperar senha/);
  assert.equal(visit(tree, (node) => node.type === 'VerificationCodeInput'), null);
  input(tree, 'E-mail').props.onChangeText('student@example.com');
  tree = flow.render();
  button(tree, 'Enviar código').props.onPress();
  button(tree, 'Enviar código').props.onPress();
  await tick();
  assert.equal(flow.calls.filter(([kind]) => kind === 'request').length, 1);

  tree = flow.render();
  assert.match(textOf(tree), /Código de recuperação/);
  assert.equal(visit(tree, (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Nova senha'), null);
  const code = visit(tree, (node) => node.type === 'VerificationCodeInput');
  assert.ok(code);
  assert.match(textOf(tree), /s\*\*\*@example.com/);
  assert.equal(button(tree, 'Confirmar código').props.disabled, true);

  code.props.onChangeText('111111');
  flow.setValidationError('invalidCode');
  tree = flow.render();
  button(tree, 'Confirmar código').props.onPress();
  await tick();
  tree = flow.render();
  assert.match(textOf(tree), /inválido ou expirado/);
  assert.equal(visit(tree, (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Nova senha'), null);
  assert.equal(button(tree, 'Reenviar código').props.disabled, true);

  flow.advanceTime(61_000);
  tree = flow.render();
  tree = flow.render();
  button(tree, 'Reenviar código').props.onPress();
  await tick();
  assert.equal(flow.calls.filter(([kind]) => kind === 'request').length, 2);
  flow.setValidationError(null);
  tree = flow.render();
  visit(tree, (node) => node.type === 'VerificationCodeInput').props.onChangeText('123456');
  tree = flow.render();
  button(tree, 'Confirmar código').props.onPress();
  await tick();
  tree = flow.render();
  assert.match(textOf(tree), /Criar nova senha/);
  assert.equal(flow.calls.filter(([kind]) => kind === 'reset').length, 0);
  assert.ok(visit(tree, (node) => node.type === 'PasswordRequirements'));

  input(tree, 'Nova senha').props.onChangeText('new-secret');
  input(tree, 'Confirmar nova senha').props.onChangeText('different');
  tree = flow.render();
  button(tree, 'Redefinir senha').props.onPress();
  assert.equal(flow.calls.filter(([kind]) => kind === 'reset').length, 0);
  tree = flow.render();
  assert.match(textOf(tree), /senhas não coincidem/);

  input(tree, 'Confirmar nova senha').props.onChangeText('new-secret');
  flow.setResetError('network');
  tree = flow.render();
  button(tree, 'Redefinir senha').props.onPress();
  await tick();
  tree = flow.render();
  assert.match(textOf(tree), /Não foi possível conectar/);
  assert.equal(input(tree, 'Nova senha').props.value, 'new-secret');

  flow.setResetError(null);
  button(tree, 'Redefinir senha').props.onPress();
  button(tree, 'Redefinir senha').props.onPress();
  await tick();
  assert.equal(flow.calls.filter(([kind]) => kind === 'reset').length, 2);
  tree = flow.render();
  assert.match(textOf(tree), /Senha alterada!/);
  button(tree, 'Entrar').props.onPress();
  assert.deepEqual(flow.navigation, ['/login']);
});

test('header and Android Back follow password, code, email, login without reopening password', async () => {
  const flow = createScreen();
  let tree = flow.render();
  input(tree, 'E-mail').props.onChangeText('student@example.com');
  tree = flow.render();
  button(tree, 'Enviar código').props.onPress();
  await tick();

  tree = flow.render();
  const codeBack = visit(tree, (node) => node.type === 'Pressable' && node.props.accessibilityLabel === 'Voltar para recuperar senha');
  codeBack.props.onPress();
  tree = flow.render();
  assert.equal(input(tree, 'E-mail').props.value, 'student@example.com');
  button(tree, 'Enviar código').props.onPress();
  await tick();

  tree = flow.render();
  visit(tree, (node) => node.type === 'VerificationCodeInput').props.onChangeText('123456');
  tree = flow.render();
  button(tree, 'Confirmar código').props.onPress();
  await tick();
  tree = flow.render();
  assert.match(textOf(tree), /Criar nova senha/);
  input(tree, 'Nova senha').props.onChangeText('secret-123');
  assert.equal(flow.pressAndroidBack(), true);
  tree = flow.render();
  assert.match(textOf(tree), /Código de recuperação/);
  assert.equal(visit(tree, (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Nova senha'), null);
  assert.equal(flow.pressAndroidBack(), true);
  tree = flow.render();
  assert.match(textOf(tree), /Recuperar senha/);
  assert.equal(flow.pressAndroidBack(), true);
  assert.deepEqual(flow.navigation, ['/login']);
});

test('a code rejected again by the final reset returns to code without reporting success', async () => {
  const flow = createScreen();
  let tree = flow.render();
  input(tree, 'E-mail').props.onChangeText('student@example.com');
  tree = flow.render();
  button(tree, 'Enviar código').props.onPress();
  await tick();
  tree = flow.render();
  visit(tree, (node) => node.type === 'VerificationCodeInput').props.onChangeText('123456');
  tree = flow.render();
  button(tree, 'Confirmar código').props.onPress();
  await tick();
  tree = flow.render();
  input(tree, 'Nova senha').props.onChangeText('new-secret');
  input(tree, 'Confirmar nova senha').props.onChangeText('new-secret');
  flow.setResetError('invalidCode');
  tree = flow.render();
  button(tree, 'Redefinir senha').props.onPress();
  await tick();
  tree = flow.render();
  assert.match(textOf(tree), /Código inválido ou expirado/);
  assert.equal(visit(tree, (node) => node.type === 'TextInput' && node.props.accessibilityLabel === 'Nova senha'), null);
  assert.equal(flow.navigation.length, 0);
});

test('registration and recovery share real password rules and the six digit control', () => {
  const source = read('src/features/auth/password-rules.ts');
  const module = { exports: {} };
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(`(function(module, exports) {${output}\n})`)(module, module.exports);
  const rules = module.exports;
  assert.equal(rules.getPasswordError('short'), 'A senha deve ter pelo menos 6 caracteres.');
  assert.equal(rules.getPasswordError('x'.repeat(101)), 'A senha deve ter no máximo 100 caracteres.');
  assert.equal(rules.getPasswordError('é'.repeat(37)), 'A senha excede o limite de 72 bytes.');
  assert.equal(rules.getPasswordError('valid-secret'), '');
  const registration = read('src/features/auth/screens/RegisterScreen.tsx');
  const verification = read('src/features/auth/screens/EmailVerificationScreen.tsx');
  const recovery = read('src/features/auth/screens/PasswordRecoveryScreen.tsx');
  assert.match(registration, /<PasswordRequirements password=\{password\}/);
  assert.match(recovery, /<PasswordRequirements password=\{password\}/);
  assert.match(verification, /<VerificationCodeInput/);
  assert.match(recovery, /<VerificationCodeInput/);
  const codeInput = read('src/features/auth/components/VerificationCodeInput.tsx');
  assert.match(codeInput, /keyboardType="number-pad"/);
  assert.match(codeInput, /maxLength=\{6\}/);
  assert.match(codeInput, /text\.replace\(\/\\D\/g, ''\)\.slice\(0, 6\)/);
});

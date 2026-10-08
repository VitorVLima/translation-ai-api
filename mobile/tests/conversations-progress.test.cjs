const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.resolve(__dirname, '../src/features/conversations/components/ConversationProgress.tsx');
const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const jsx = (type, props) => ({ type, props: props ?? {} });
const moduleRef = { exports: {} };
vm.runInNewContext(`(function(require, module, exports) {${output}\n})`, { console })((request) => {
  if (request.endsWith('/theme/useThemedStyles')) return { useThemedStyles: (styles) => styles };
  if (request === 'react/jsx-runtime') return { jsx, jsxs: jsx };
  if (request === 'react-native') return {
    ActivityIndicator: 'ActivityIndicator', Pressable: 'Pressable', Text: 'Text', View: 'View',
    StyleSheet: { create: (styles) => styles },
  };
  if (request === 'expo-symbols') return { SymbolView: 'SymbolView' };
  if (request === '../conversations.presentation') return {
    getConversationEvaluationProgress: (messages) => ({ displayCurrent: messages.length, required: 5, ready: messages.length >= 5 }),
    getEvaluationProgressCopy: (ready) => ready
      ? { detail: 'Pronto para avaliação.', accessibilityLabel: 'Progresso para avaliação. Pronto para avaliação.' }
      : { detail: 'Continue conversando para liberar sua avaliação.', accessibilityLabel: 'Progresso para avaliação. Continue conversando.' },
  };
  throw new Error(`Unexpected import: ${request}`);
}, moduleRef, moduleRef.exports);

function flatten(node) {
  if (node == null || typeof node === 'boolean') return [];
  if (Array.isArray(node)) return node.flatMap(flatten);
  if (typeof node !== 'object') return [node];
  return [node, ...flatten(node.props.children)];
}

test('antes da prontidão mantém aviso sem ação de finalizar', () => {
  const tree = moduleRef.exports.ConversationProgress({ messages: [1, 2], isCompleting: false, onComplete() {} });
  const nodes = flatten(tree);
  const row = nodes.find((node) => node?.props?.style?.[0]?.gap === 8 && node.props.style[0].marginTop === 7);
  assert.ok(row);
  assert.equal(row.props.style[1], false);
  assert.equal(row.props.children[1], null);
  assert.equal(row.props.children[0].props.style[0].flex, 1);
  assert.equal(tree.props.style[1], false);
  assert.ok(nodes.some((node) => node?.props?.children === 'Continue conversando para liberar sua avaliação.'));
  assert.equal(nodes.some((node) => node?.props?.accessibilityLabel === 'Finalizar conversa'), false);
});

test('pronto coloca botão ao lado da barra, pinta o bloco de verde e preserva ação e loading', () => {
  let completions = 0;
  const props = { messages: [1, 2, 3, 4, 5], isCompleting: false, onComplete() { completions += 1; } };
  const tree = moduleRef.exports.ConversationProgress(props);
  const nodes = flatten(tree);
  const row = nodes.find((node) => node?.props?.style?.[0]?.gap === 8 && node.props.style[0].marginTop === 7);
  const button = nodes.find((node) => node?.props?.accessibilityLabel === 'Finalizar conversa');
  assert.ok(row);
  assert.equal(row.props.children[1], button);
  assert.equal(row.props.children[0].props.style[0].flex, 1);
  assert.equal(row.props.children[0].props.children.props.style[2].width, '100%');
  assert.equal(tree.props.style[1].backgroundColor, '#eef8f2');
  assert.equal(tree.props.style[1].paddingVertical, 6);
  assert.equal(row.props.style[1].marginTop, 4);
  assert.equal(tree.props.children[2], null);
  assert.equal(nodes.some((node) => node?.props?.children === 'Pronto para avaliação.'), false);
  assert.ok(nodes.some((node) => node?.props?.children === 'Finalizar'));
  assert.equal(button.props.style({ pressed: false })[0].backgroundColor, '#3d805c');
  assert.equal(button.props.style({ pressed: false })[0].minHeight, 34);
  assert.equal(button.props.hitSlop, 5);
  button.props.onPress();
  assert.equal(completions, 1);

  const busy = flatten(moduleRef.exports.ConversationProgress({ ...props, isCompleting: true }))
    .find((node) => node?.props?.accessibilityLabel === 'Avaliando sua conversa');
  assert.equal(busy.props.disabled, true);
  assert.equal(busy.props.accessibilityState.busy, true);
});

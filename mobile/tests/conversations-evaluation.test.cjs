const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadTypeScript(relativePath, dependencies = {}) {
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require, module, exports) {${compiled}\n})`, vm.createContext({ console }))(
    (name) => {
      if (name.endsWith('/theme/useThemedStyles')) return { useThemedStyles: (styles) => styles };
      if (!(name in dependencies)) throw new Error(`Unexpected import: ${name}`);
      return dependencies[name];
    }, module, module.exports,
  );
  return module.exports;
}

test('Back fecha a avaliação antes de navegar, tanto no header quanto no Android', () => {
  const { handleConversationBack } = loadTypeScript('../src/features/conversations/conversation-evaluation-navigation.ts');
  let expanded = true;
  let closed = 0;
  let navigated = 0;
  const back = () => handleConversationBack(expanded, () => { expanded = false; closed += 1; }, () => { navigated += 1; });

  assert.equal(back(), false); // Header: ação local.
  assert.equal(closed, 1);
  assert.equal(navigated, 0);
  assert.equal(back(), true); // Header: agora sai da conversa.
  assert.equal(navigated, 1);

  let focusEffect;
  let hardwareBack;
  let beforeRemove;
  const { useDeterministicBack } = loadTypeScript('../src/hooks/use-deterministic-back.ts', {
    react: { useCallback: (callback) => callback, useRef: (value) => ({ current: value }) },
    'expo-router': {
      useFocusEffect: (callback) => { focusEffect = callback; },
      useNavigation: () => ({ addListener: (_name, callback) => { beforeRemove = callback; return () => {}; } }),
    },
    'react-native': {
      BackHandler: { addEventListener: (_name, callback) => { hardwareBack = callback; return { remove() {} }; } },
      Platform: { OS: 'android' },
    },
  });
  expanded = true;
  useDeterministicBack(back);
  const cleanup = focusEffect();
  assert.equal(hardwareBack(), true);
  assert.equal(closed, 2);
  assert.equal(navigated, 1);
  assert.equal(hardwareBack(), true);
  assert.equal(navigated, 2);
  cleanup();

  expanded = true;
  useDeterministicBack(back);
  focusEffect();
  let prevented = 0;
  const pop = { data: { action: { type: 'GO_BACK' } }, preventDefault() { prevented += 1; } };
  beforeRemove(pop);
  assert.equal(closed, 3);
  assert.equal(navigated, 2);
  beforeRemove(pop);
  assert.equal(prevented, 2);
  assert.equal(navigated, 3);

  const screenSource = fs.readFileSync(path.resolve(__dirname, '../src/features/conversations/screens/ConversationScreen.tsx'), 'utf8');
  assert.match(screenSource, /useDeterministicBack\(backFromConversation\)/);
  assert.match(screenSource, /<ConversationHeader conversation=\{conversation\} onBack=\{backFromConversation\}/);
});

test('painel compacto preserva notas e alterna detalhes sem perder feedback', () => {
  const presentation = loadTypeScript('../src/features/conversations/conversations.presentation.ts');
  let slots = [];
  let cursor = 0;
  const jsx = (type, props) => ({ type, props: props ?? {} });
  const { ConversationEvaluationCard } = loadTypeScript('../src/features/conversations/components/ConversationEvaluationCard.tsx', {
    react: { useState: (initial) => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], (value) => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    } },
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    'react-native': {
      Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View',
      StyleSheet: { absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }, create: (styles) => styles },
    },
    'expo-symbols': { SymbolView: 'SymbolView' },
    '../conversations.presentation': presentation,
  });
  const evaluation = {
    conversationId: 'conversation-1', status: 'SUCCESS',
    scores: { overall: 75, communication: 80, grammar: 70, vocabulary: 75, fluency: 75, relevance: 75 },
    strengths: ['Argumentou com clareza'], improvements: ['Revise concordância'],
  };
  const render = () => { cursor = 0; return ConversationEvaluationCard({ evaluation,
    onMinimize() {}, onNewConversation() {}, onBackToConversations() {} }); };
  function flatten(node) {
    if (node == null || typeof node === 'boolean') return [];
    if (Array.isArray(node)) return node.flatMap(flatten);
    if (typeof node !== 'object') return [node];
    const rendered = typeof node.type === 'function' ? node.type(node.props) : node;
    if (rendered !== node) return flatten(rendered);
    return [node, ...flatten(node.props.children)];
  }
  const texts = (tree) => flatten(tree).filter((node) => typeof node === 'string' || typeof node === 'number').join(' ');
  const button = (tree, label) => flatten(tree).find((node) => node?.type === 'Pressable' && node.props.accessibilityLabel === label);

  let tree = render();
  assert.ok(button(tree, 'Ver detalhes'));
  assert.match(texts(tree), /Boa comunicação!/);
  for (const label of ['Comunicação', 'Gramática', 'Vocabulário', 'Fluência', 'Relevância']) assert.match(texts(tree), new RegExp(label));
  for (const score of ['80', '70', '75']) assert.match(texts(tree), new RegExp(score));
  assert.doesNotMatch(texts(tree), /Argumentou com clareza|Revise concordância/);
  const overallRing = flatten(tree).find((node) => node?.props?.accessibilityLabel === 'Resultado geral: 75 de 100');
  assert.ok(overallRing);
  assert.equal(presentation.EVALUATION_POSITIVE_SCORE_THRESHOLD, 70);
  assert.equal(presentation.getEvaluationScoreTone(70), 'positive');
  assert.equal(presentation.getEvaluationScoreTone(65), 'negative');
  const ringArcs = flatten(overallRing).filter((node) => Array.isArray(node?.props?.style)
    && node.props.style[1]?.borderTopColor);
  assert.equal(ringArcs.length, 2);
  assert.ok(ringArcs.every((node) => node.props.style[1].borderTopColor === '#3c8360'));
  const metricRows = flatten(tree).filter((node) => /^(Comunica|Gram|Vocabul|Flu|Relev)/.test(node?.props?.accessibilityLabel ?? ''));
  assert.equal(metricRows.length, 5);
  assert.ok(metricRows.every((row) => flatten(row).some((node) => Array.isArray(node?.props?.style)
    && node.props.style[1]?.width?.endsWith('%'))));

  evaluation.scores.grammar = 65;
  tree = render();
  const grammarRow = flatten(tree).find((node) => node?.props?.accessibilityLabel?.startsWith('Gram'));
  assert.ok(flatten(grammarRow).some((node) => node?.props?.style?.[1]?.backgroundColor === '#8f3c42'
    && node.props.style[1].width === '65%'));
  evaluation.scores.overall = 65;
  tree = render();
  const lowOverallRing = flatten(tree).find((node) => node?.props?.accessibilityLabel === 'Resultado geral: 65 de 100');
  assert.ok(flatten(lowOverallRing).some((node) => node?.props?.style?.[1]?.borderTopColor === '#8f3c42'));

  button(tree, 'Ver detalhes').props.onPress();
  tree = render();
  assert.ok(button(tree, 'Ocultar detalhes'));
  assert.match(texts(tree), /Argumentou com clareza/);
  assert.match(texts(tree), /Revise concordância/);
  button(tree, 'Ocultar detalhes').props.onPress();
  tree = render();
  assert.ok(button(tree, 'Ver detalhes'));
  assert.doesNotMatch(texts(tree), /Argumentou com clareza|Revise concordância/);

  const missingRelevance = presentation.getEvaluationScorePresentation({ ...evaluation.scores, relevance: null });
  assert.equal(missingRelevance.length, 5);
  assert.equal(missingRelevance.at(-1).value, null);
});

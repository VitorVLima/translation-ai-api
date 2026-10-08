const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadPresentation() {
  const file = path.resolve(__dirname, '../src/features/home/home.presentation.ts');
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({});
  const execute = vm.runInContext(`(function(require, module, exports) {${output}\n})`, context, { filename: file });
  execute((request) => {
    if (request === '../../i18n/translate') return require('./i18n-helper.cjs');
    throw new Error(`Unexpected import: ${request}`);
  }, module, module.exports);
  return module.exports;
}

const { getHomeVocabularyCardWidth } = loadPresentation();
const cardSource = fs.readFileSync(path.resolve(__dirname, '../src/features/home/components/HomeVocabularyCard.tsx'), 'utf8');

function words(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `word-${index}`,
    word: `english-${index}`,
    translation: `português-${index}`,
  }));
}

test('carrossel disponibiliza as dez palavras reais na ordem recebida', () => {
  const lessonWords = words(10);
  assert.deepEqual(lessonWords.map(({ word }) => word), [
    'english-0', 'english-1', 'english-2', 'english-3', 'english-4',
    'english-5', 'english-6', 'english-7', 'english-8', 'english-9',
  ]);
  assert.match(cardSource, /<FlatList/);
  assert.match(cardSource, /data=\{lesson\.words\}/);
  assert.doesNotMatch(cardSource, /getHomeVocabularyPages|pageIndex|setPageIndex|\.slice\(/);
});

test('lista com uma palavra mantém o mesmo card de largura controlada', () => {
  const lessonWords = words(1);
  assert.equal(lessonWords.length, 1);
  assert.match(cardSource, /style=\{\[styles\.wordCard, \{ width: wordCardWidth \}\]\}/);
  assert.match(cardSource, /flexGrow: 0, flexShrink: 0, height: WORD_CARD_HEIGHT/);
});

test('última palavra não recebe layout ou expansão especial', () => {
  assert.match(cardSource, /renderItem=\{\(\{ item: word \}\) =>/);
  assert.doesNotMatch(cardSource, /item: word, index|index === lesson\.words\.length|lastWord|lastItem/);
  assert.doesNotMatch(cardSource, /pagerArrow|pageIndicator|pageDot|Palavras anteriores|Próximas palavras/);
});

test('largura responsiva preserva o peek em 360, 390 e 412 pixels', () => {
  assert.equal(getHomeVocabularyCardWidth(360), 104);
  assert.equal(getHomeVocabularyCardWidth(390), 115);
  assert.equal(getHomeVocabularyCardWidth(412), 123);
  assert.match(cardSource, /useWindowDimensions/);
});

test('swipe horizontal usa snap suave por card e espaçamento consistente', () => {
  assert.match(cardSource, /horizontal/);
  assert.match(cardSource, /snapToInterval=\{snapInterval\}/);
  assert.match(cardSource, /snapToAlignment="start"/);
  assert.match(cardSource, /decelerationRate="fast"/);
  assert.match(cardSource, /ItemSeparatorComponent/);
});

test('texto longo permanece limitado e alinhado dentro do card', () => {
  const longTranslation = 'enfermeiro / enfermeira';
  assert.ok(longTranslation.length > 20);
  assert.match(cardSource, /<Text numberOfLines=\{2\} style=\{styles\.translation\}>/);
  assert.match(cardSource, /textAlign: 'center'/);
});

test('botão de áudio envia word.word ao TTS compartilhado', () => {
  assert.match(cardSource, /useVocabularySpeech/);
  assert.match(cardSource, /VocabularyAudioButton/);
  assert.match(cardSource, /onPress=\{\(\) => playWord\(word\.id, word\.word\)\}/);
  assert.match(cardSource, /play\('word', word\)/);
});

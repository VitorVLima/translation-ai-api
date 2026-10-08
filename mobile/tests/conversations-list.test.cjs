const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const presentationPath = path.resolve(__dirname, '../src/features/conversations/conversations.presentation.ts');
const compiled = ts.transpileModule(fs.readFileSync(presentationPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const presentationModule = { exports: {} };
vm.runInNewContext(`(function(require, module, exports) {${compiled}\n})`, vm.createContext({ URL }))(
  () => { throw new Error('Unexpected runtime import'); },
  presentationModule,
  presentationModule.exports,
);

const { filterConversationListItems } = presentationModule.exports;

function listItem(overrides = {}) {
  return {
    id: 'conversation-1',
    title: 'Restaurante',
    description: 'Pratique pedidos de comida.',
    difficultyLabel: 'Iniciante',
    interactionModeLabel: 'Texto',
    assistantDisplayName: 'Layla',
    dateLabel: 'Atualizada em 02 de out. de 2026',
    avatarImageUrl: null,
    completed: false,
    ...overrides,
  };
}

test('busca local filtra campos reais da conversa sem diferenciar caixa ou acentos', () => {
  const items = [
    listItem(),
    listItem({ id: 'conversation-2', title: 'Entrevista', description: 'Converse sobre carreira.', assistantDisplayName: 'Rodrigo' }),
  ];

  assert.deepEqual(filterConversationListItems(items, 'restaurante').map(({ id }) => id), ['conversation-1']);
  assert.deepEqual(filterConversationListItems(items, 'CARREIRA').map(({ id }) => id), ['conversation-2']);
  assert.deepEqual(filterConversationListItems(items, 'laylá').map(({ id }) => id), ['conversation-1']);
  assert.deepEqual(filterConversationListItems(items, 'não existe'), []);
  assert.equal(filterConversationListItems(items, '   '), items);
});

test('lista compacta mantém avatar, badge, menu, navegação por chevron e descrição real', () => {
  const itemSource = fs.readFileSync(path.resolve(__dirname, '../src/features/conversations/components/ConversationListItem.tsx'), 'utf8');
  const screenSource = fs.readFileSync(path.resolve(__dirname, '../src/features/conversations/screens/ConversationsScreen.tsx'), 'utf8');

  assert.match(itemSource, /conversation\.description/);
  assert.match(itemSource, /more_horiz/);
  assert.match(itemSource, /chevron_right/);
  assert.match(itemSource, /accessibilityLabel=\{`Excluir conversa:/);
  assert.match(screenSource, /filterConversationListItems/);
  assert.match(screenSource, /getConversations\(controller\.signal\)/);
  assert.match(screenSource, /deleteConversation\(conversation\.id\)/);
});

test('hero usa a proporção do PNG local sem recortar e mantém a ordem da lista', () => {
  const heroSource = fs.readFileSync(path.resolve(__dirname, '../src/features/conversations/components/ConversationIntroHero.tsx'), 'utf8');
  const screenSource = fs.readFileSync(path.resolve(__dirname, '../src/features/conversations/screens/ConversationsScreen.tsx'), 'utf8');
  const png = fs.readFileSync(path.resolve(__dirname, '../docs/hero-conversa.png'));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0);
  assert.match(heroSource, /Image\.resolveAssetSource\(heroImage\)/);
  assert.match(heroSource, /aspectRatio: imageWidth \/ imageHeight/);
  assert.match(heroSource, /resizeMode="contain"/);
  assert.doesNotMatch(heroSource, /<Text\b/);
  assert.ok(screenSource.indexOf('<ConversationIntroHero />') < screenSource.indexOf('<View style={styles.searchField}>'));
  assert.ok(screenSource.indexOf('<View style={styles.searchField}>') < screenSource.indexOf('accessibilityLabel="Criar nova conversa"'));
});

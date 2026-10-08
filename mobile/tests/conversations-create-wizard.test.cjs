const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const screen = fs.readFileSync(path.resolve(__dirname, '../src/features/conversations/screens/CreateConversationScreen.tsx'), 'utf8');
const difficulty = fs.readFileSync(path.resolve(__dirname, '../src/features/conversations/components/ConversationDifficultyCard.tsx'), 'utf8');
const scenario = fs.readFileSync(path.resolve(__dirname, '../src/features/conversations/components/ConversationScenarioCard.tsx'), 'utf8');
const mode = fs.readFileSync(path.resolve(__dirname, '../src/features/conversations/components/ConversationModeCard.tsx'), 'utf8');

test('wizard mostra uma etapa por vez, sem hero, com tema e progresso compactos', () => {
  assert.match(screen, /type WizardStep = 1 \| 2 \| 3/);
  assert.match(screen, /Etapa \{step\} de 3/);
  assert.match(screen, /step === 1 && status === 'success'/);
  assert.match(screen, /step === 2 \? \(/);
  assert.match(screen, /step === 3 \? \(/);
  assert.match(screen, /Escolha um tema/);
  assert.doesNotMatch(screen, /introCard|Escolha uma situa|PRATIQUE INGL/);
  assert.match(screen, /key=\{step\}/);
  assert.match(scenario, /avatarImageUrl/);
});

test('Back percorre as etapas sem limpar escolhas e criar conserva a chamada existente', () => {
  assert.match(screen, /useDeterministicBack\(goBack\)/);
  assert.match(screen, /if \(step > 1\)/);
  assert.match(screen, /current === 3 \? 2 : 1/);
  assert.match(screen, /goToConversations\(\)/);
  assert.match(screen, /onPress=\{goBack\}/);
  assert.match(screen, /const canContinue = step === 1 \? selectedScenario !== null/);
  assert.match(screen, /if \(step !== 3 .*creationInFlight\.current\) return/);
  assert.match(screen, /buildCreateConversationRequest\(selectedScenario, selectedDifficulty, selectedMode\)/);
  assert.match(screen, /await createConversation\(request\)/);
  assert.doesNotMatch(screen, /setSelectedScenario\(null\)|setSelectedDifficulty\('INTERMEDIATE'\)|setSelectedMode\(DEFAULT_CONVERSATION_MODE\)/);
});

test('nivel e modo usam cards horizontais compactos com selecao acessivel', () => {
  assert.match(screen, /difficultyList: \{ gap: 10/);
  assert.match(difficulty, /flexDirection: 'row'/);
  assert.match(difficulty, /option\.cefr/);
  assert.match(difficulty, /Para voc/);
  assert.match(difficulty, /accessibilityRole="radio"/);
  assert.match(mode, /flexDirection: 'row'/);
  assert.match(mode, /accessibilityRole="radio"/);
});

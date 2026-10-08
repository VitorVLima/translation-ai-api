const test = require('node:test');
const assert = require('node:assert/strict');
const { translate } = require('./i18n-helper.cjs');

test('catálogo apresenta interface e labels de domínio em português', () => {
  assert.equal(translate('profile.title'), 'Meu perfil');
  assert.equal(translate('home.dailyGoal.count', { count: 2 }), 'Você concluiu 2 de 3 atividades de hoje.');
  assert.equal(translate('domain.goal.TRAVEL'), 'Viagens');
  assert.equal(translate('setup.level.B1'), 'Intermediário');
  assert.equal(translate('domain.vocabulary.TRAVEL'), 'Viagem');
});

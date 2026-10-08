const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const card = fs.readFileSync(path.resolve(__dirname, '../src/features/conversations/components/ConversationFocusCard.tsx'), 'utf8');

test('Home keeps conversation content and actions above the local background in both states', () => {
  assert.ok(fs.existsSync(path.resolve(__dirname, '../assets/fundo-home-conversa.png')));
  assert.match(card, /require\('\.\.\/\.\.\/\.\.\/\.\.\/assets\/fundo-home-conversa\.png'\)/);
  assert.match(card, /<ImageBackground[\s\S]*imageStyle=\{styles\.backgroundImage\}/);
  assert.doesNotMatch(card, /ArtworkSoftener|imageContrast|contrastStrong|contrastMedium|contrastSoft/);
  assert.match(card, /const styles = baseStyles/);
  assert.match(card, /resizeMode="cover"/);
  assert.match(card, /overflow: 'hidden'/);
  assert.ok(card.indexOf('<ImageBackground') < card.indexOf("presentation?.kind === 'continue' ? ("));
  assert.match(card, /<\/ImageBackground>/);
  assert.match(card, /presentation\?\.kind === 'continue'/);
  assert.match(card, /presentation\?\.kind === 'new'/);
  assert.match(card, /onPress=\{onPrimaryPress\}/);
  assert.match(card, /onPress=\{onSeeAllPress\}/);
  assert.doesNotMatch(card, /rgba\(255,255,255,0\.84\)/);
  assert.match(card, /title: \{[^\n]*textShadowColor: '#ffffff'/);
  assert.match(card, /metadata: \{[^\n]*textShadowColor: '#ffffff'/);
  assert.match(card, /description: \{[^\n]*textShadowColor: '#ffffff'/);
  assert.match(card, /metadata: \{ color: '#3f465f'/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

function getFunctionBody(source, name) {
  const start = source.indexOf(`const ${name} = useCallback(() => {`);
  assert.notEqual(start, -1, `${name} must remain an explicit callback`);
  const end = source.indexOf('\n  },', start);
  assert.notEqual(end, -1, `${name} callback must have a dependency list`);
  return source.slice(start, end);
}

test('vocabulary stop does not call a released player after unmount', () => {
  const source = read('../src/features/vocabulary/audio/use-vocabulary-speech.ts');
  const body = getFunctionBody(source, 'stop');
  assert.match(body, /if \(mounted\.current\) \{/);
  assert.ok(body.indexOf('if (mounted.current) {') < body.indexOf('player.pause()'));
});

test('conversation playback stop does not call a released player after unmount', () => {
  const source = read('../src/features/conversations/audio/use-conversation-voice.ts');
  const body = getFunctionBody(source, 'stopPlayback');
  assert.match(body, /if \(mounted\.current\) \{/);
  assert.ok(body.indexOf('if (mounted.current) {') < body.indexOf('player.pause()'));
  assert.match(source, /useAudioPlayer owns and releases its shared player during unmount/);
});

test('async playback keeps release guards before replace/play', () => {
  const vocabulary = read('../src/features/vocabulary/audio/use-vocabulary-speech.ts');
  const conversation = read('../src/features/conversations/audio/use-conversation-voice.ts');
  assert.match(vocabulary, /!mounted\.current \|\| currentGeneration !== generation\.current/);
  assert.match(conversation, /!mounted\.current \|\| currentGeneration !== generation\.current/);
});

test('audio hooks restore their mounted guard when effects are set up again', () => {
  const vocabulary = read('../src/features/vocabulary/audio/use-vocabulary-speech.ts');
  const conversation = read('../src/features/conversations/audio/use-conversation-voice.ts');
  assert.match(vocabulary, /useEffect\(\(\) => \{\s*mounted\.current = true;/);
  assert.match(conversation, /useEffect\(\(\) => \{\s*mounted\.current = true;/);
});

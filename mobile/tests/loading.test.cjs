const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

test('PageLoading é compartilhado e ocupa a página sem conteúdo parcial', () => {
  const loading = source('../src/components/PageLoading.tsx');
  assert.match(loading, /SafeAreaView/);
  assert.match(loading, /ActivityIndicator/);
  assert.match(loading, /accessibilityRole="progressbar"/);
  assert.match(loading, /flex: 1/);
});

test('Home aguarda todas as fontes essenciais antes da primeira renderização', () => {
  const home = source('../src/features/home/screens/HomeScreen.tsx');
  assert.match(home, /Promise\.allSettled/);
  assert.match(home, /getHomeProfileData\(controller\.signal\)/);
  assert.match(home, /getDailyVocabulary\(controller\.signal\)/);
  assert.match(home, /getProgressOverview\(controller\.signal\)/);
  assert.match(home, /getConversations\(controller\.signal\)/);
  assert.match(home, /if \(!page\.data && page\.status === 'loading'\) return <PageLoading/);
  assert.match(home, /const hasData = dataRef\.current !== null/);
  assert.match(home, /else if \(mode === 'refresh'\)/);
  assert.match(home, /loadHome\('focus'\)/);
});

test('Progress só libera o dashboard depois de progress e timeline', () => {
  const progress = source('../src/features/progress/screens/ProgressPlaceholderScreen.tsx');
  assert.match(progress, /Promise\.allSettled/);
  assert.match(progress, /const hasCompleteData = stateRef\.current\.data !== null && stateRef\.current\.timeline !== null/);
  assert.match(progress, /if \(dashboardResult\.status === 'rejected' \|\| timelineResult\.status === 'rejected'\)/);
  assert.match(progress, /if \(state\.loading && \(!data \|\| !state\.timeline\)\) return <PageLoading/);
  assert.match(progress, /void load\(true\)/);
});

test('listas e subtelas não mostram empty state durante o loading inicial', () => {
  const screens = [
    ['../src/features/conversations/screens/ConversationsScreen.tsx', /if \(status === 'loading'\) return <PageLoading/],
    ['../src/features/reading/screens/ReadingScreen.tsx', /if \(status === 'loading'\) return <PageLoading/],
    ['../src/features/vocabulary/screens/VocabularyStudyScreen.tsx', /if \(state\.status === 'loading' && !lesson\) return <PageLoading/],
    ['../src/features/vocabulary/screens/VocabularyQuizScreen.tsx', /if \(phase === 'loading'\) return <PageLoading/],
    ['../src/features/reading/screens/ReadingActivityScreen.tsx', /if \(status === 'loading' && !detail\) return <PageLoading/],
    ['../src/features/reading/screens/ReadingQuestionsScreen.tsx', /if \(phase === 'loading'\) return <PageLoading/],
    ['../src/features/conversations/screens/ConversationScreen.tsx', /if \(status === 'loading'\) return <PageLoading/],
    ['../src/features/conversations/screens/CreateConversationScreen.tsx', /if \(status === 'loading'\) return <PageLoading/],
    ['../src/features/profile/screens/ProfileScreen.tsx', /if \(state\.status === 'loading' && !state\.data\)/],
  ];
  for (const [file, pattern] of screens) assert.match(source(file), pattern, file);
});

test('focus e refresh invalidam requests antigas e preservam dados existentes', () => {
  const home = source('../src/features/home/screens/HomeScreen.tsx');
  const progress = source('../src/features/progress/screens/ProgressPlaceholderScreen.tsx');
  const conversations = source('../src/features/conversations/screens/ConversationsScreen.tsx');
  const reading = source('../src/features/reading/screens/ReadingScreen.tsx');
  const vocabulary = source('../src/features/vocabulary/screens/VocabularyStudyScreen.tsx');

  for (const file of [home, progress, conversations, reading, vocabulary]) {
    assert.match(file, /AbortController/);
    assert.match(file, /requestId|versionRef/);
  }
  assert.match(home, /dataRef\.current/);
  assert.match(progress, /preserveCurrent/);
  assert.match(conversations, /statusRef\.current === 'success'/);
  assert.match(reading, /load\(loaded\.current\)/);
  assert.match(vocabulary, /loadLesson\(loaded\.current\)/);
});

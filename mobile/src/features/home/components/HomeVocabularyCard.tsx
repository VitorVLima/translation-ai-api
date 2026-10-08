import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useEffect, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useVocabularySpeech } from '../../vocabulary/audio/use-vocabulary-speech';
import { VocabularyAudioButton } from '../../vocabulary/components/VocabularyAudioButton';
import { getVocabularyCategoryLabel } from '../../vocabulary/vocabulary.presentation';
import type { DailyVocabularyLesson } from '../../vocabulary/vocabulary.types';
import { getHomeVocabularyCardWidth, getHomeVocabularyState, type HomeVocabularyState } from '../home.presentation';
import { useI18n } from '../../../i18n';

type HomeVocabularyCardProps = {
  lesson: DailyVocabularyLesson | null;
  status: 'loading' | 'success' | 'error';
  onRetry: () => void;
  onPress: () => void;
};

const WORD_CARD_GAP = 8;
const WORD_CARD_HEIGHT = 104;

export function HomeVocabularyCard({ lesson, status, onRetry, onPress }: HomeVocabularyCardProps) {
  const styles = useThemedStyles(baseStyles);
  const { t } = useI18n();
  const { width: viewportWidth } = useWindowDimensions();
  const [activeWord, setActiveWord] = useState<{ lessonId: string; wordId: string } | null>(null);
  const { activeKey, loadingKey, play, stop } = useVocabularySpeech();
  const activeWordId = activeWord && activeWord.lessonId === lesson?.id && (activeKey || loadingKey) ? activeWord.wordId : null;
  const state = lesson ? getHomeVocabularyState(lesson) : null;
  const category = lesson ? getVocabularyCategoryLabel(lesson.category) : null;
  const wordCardWidth = getHomeVocabularyCardWidth(viewportWidth);
  const snapInterval = wordCardWidth + WORD_CARD_GAP;
  const stateLabels: Record<HomeVocabularyState, string> = {
    'not-started': t('home.status.notStarted'), 'in-progress': t('home.status.inProgress'), completed: t('home.status.completed'),
  };
  const actionLabels: Record<HomeVocabularyState, string> = {
    'not-started': t('home.action.startLesson'), 'in-progress': t('home.action.continueLesson'), completed: t('home.action.reviewWords'),
  };

  useEffect(() => {
    stop();
  }, [lesson?.id, stop]);

  const playWord = (wordId: string, word: string) => {
    if (activeKey === 'word' || loadingKey === 'word') {
      stop();
      setActiveWord(null);
      return;
    }
    if (lesson) setActiveWord({ lessonId: lesson.id, wordId });
    void play('word', word);
  };

  return (
    <View accessibilityLabel={t('home.vocabulary')} style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <View style={styles.sectionIcon}>
            <SymbolView accessible={false} name={{ ios: 'text.book.closed.fill', android: 'menu_book', web: 'menu_book' }} size={17} tintColor="#5b50f5" />
          </View>
          <Text style={styles.sectionTitle}>{t('home.vocabulary')}</Text>
        </View>
        <Pressable accessibilityLabel={t('home.vocabulary')} accessibilityRole="button" onPress={onPress}>
          <Text style={styles.link}>{t('home.seeMore')} →</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        {status === 'loading' ? (
          <View accessibilityLiveRegion="polite" accessibilityRole="progressbar" style={styles.stateRow}>
            <ActivityIndicator color="#5b50f5" size="small" />
            <Text style={styles.muted}>{t('home.vocabularyLoading')}</Text>
          </View>
        ) : null}
        {status === 'error' ? (
          <View style={styles.errorRow}>
            <Text style={styles.errorText}>{t('home.vocabularyError')}</Text>
            <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </Pressable>
          </View>
        ) : null}
        {status === 'success' && lesson && state ? (
          <>
            <View style={styles.metaRow}>
              <View style={styles.categoryBlock}>
                <Text style={styles.category}>{category ?? t('home.activity.vocabulary')}</Text>
                <Text style={styles.wordCount}>{t('home.words', { count: lesson.words.length })}</Text>
              </View>
              <Text style={[styles.status, state === 'completed' && styles.statusCompleted]}>{stateLabels[state]}</Text>
            </View>
            <FlatList
              accessibilityLabel={t('home.vocabulary')}
              contentContainerStyle={styles.carouselContent}
              data={lesson.words}
              decelerationRate="fast"
              extraData={`${activeWordId}:${activeKey}:${loadingKey}`}
              getItemLayout={(_, index) => ({ index, length: wordCardWidth, offset: snapInterval * index })}
              horizontal
              ItemSeparatorComponent={() => <View style={styles.wordSeparator} />}
              keyExtractor={(word) => word.id}
              nestedScrollEnabled
              renderItem={({ item: word }) => {
                const isActive = activeWordId === word.id && activeKey === 'word';
                const isLoading = activeWordId === word.id && loadingKey === 'word';
                return (
                  <View style={[styles.wordCard, { width: wordCardWidth }]}>
                    <View style={styles.wordCopy}>
                      <Text numberOfLines={1} style={styles.word}>{word.word}</Text>
                      <Text numberOfLines={2} style={styles.translation}>{word.translation}</Text>
                    </View>
                    <VocabularyAudioButton
                      accessibilityLabel={`${t('home.listenWord')} ${word.word}`}
                      loading={isLoading}
                      onPress={() => playWord(word.id, word.word)}
                      playing={isActive}
                    />
                  </View>
                );
              }}
              showsHorizontalScrollIndicator={false}
              snapToAlignment="start"
              snapToInterval={snapInterval}
              style={styles.carousel}
            />
            <Pressable accessibilityLabel={actionLabels[state]} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
              <Text style={styles.actionText}>{actionLabels[state]}</Text>
              <Text style={styles.actionArrow}>→</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  section: { marginTop: 16 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  sectionIcon: { alignItems: 'center', backgroundColor: '#efedff', borderRadius: 9, height: 28, justifyContent: 'center', width: 28 },
  sectionTitle: { color: '#171528', fontSize: 16, fontWeight: '800' },
  link: { color: '#5147df', fontSize: 11.5, fontWeight: '800' },
  card: { backgroundColor: '#ffffff', borderColor: '#e8eaf2', borderRadius: 16, borderWidth: 1, padding: 11 },
  stateRow: { alignItems: 'center', flexDirection: 'row', gap: 9, minHeight: 78 },
  muted: { color: '#676c81', fontSize: 12 },
  errorRow: { minHeight: 78, justifyContent: 'center' },
  errorText: { color: '#8b4451', fontSize: 12 },
  retry: { alignSelf: 'flex-start', marginTop: 5, paddingVertical: 5 },
  retryText: { color: '#5147df', fontSize: 11.5, fontWeight: '700' },
  metaRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  categoryBlock: { flex: 1 },
  category: { color: '#171528', fontSize: 14, fontWeight: '800' },
  wordCount: { color: '#6f7487', fontSize: 11.5, marginTop: 2 },
  status: { backgroundColor: '#e6efff', borderRadius: 10, color: '#286cd3', fontSize: 10.5, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 },
  statusCompleted: { backgroundColor: '#dcf5e8', color: '#247a55' },
  carousel: { marginTop: 9 },
  carouselContent: { paddingRight: 8 },
  wordSeparator: { width: WORD_CARD_GAP },
  wordCard: { alignItems: 'center', backgroundColor: '#f7f8fd', borderColor: '#e8eaf2', borderRadius: 10, borderWidth: 1, flexGrow: 0, flexShrink: 0, height: WORD_CARD_HEIGHT, justifyContent: 'space-between', paddingHorizontal: 6, paddingVertical: 7 },
  wordCopy: { alignItems: 'center', minHeight: 42, width: '100%' },
  word: { color: '#171528', fontSize: 11.5, fontWeight: '700', maxWidth: '100%', textAlign: 'center' },
  translation: { color: '#6f7487', fontSize: 10.5, lineHeight: 13, marginTop: 3, maxWidth: '100%', textAlign: 'center' },
  action: { alignItems: 'center', backgroundColor: '#efedff', borderRadius: 10, flexDirection: 'row', justifyContent: 'center', marginTop: 9, minHeight: 38, paddingHorizontal: 12 },
  actionText: { color: '#5147df', fontSize: 12, fontWeight: '800' },
  actionArrow: { color: '#5147df', fontSize: 18, fontWeight: '700', marginLeft: 7 },
  pressed: { opacity: 0.72 },
});

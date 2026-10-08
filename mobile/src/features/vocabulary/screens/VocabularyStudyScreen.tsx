import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageLoading } from '../../../components/PageLoading';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { useDeterministicBack } from '../../../hooks/use-deterministic-back';
import { useTranslatorVoice } from '../../translator/audio/use-translator-voice';
import { useVocabularySpeech, type VocabularySpeechKey } from '../audio/use-vocabulary-speech';
import { VocabularyPronunciationPractice } from '../components/VocabularyPronunciationPractice';
import { VocabularyStudyCard } from '../components/VocabularyStudyCard';
import { compareVocabularyPronunciation, getVocabularyCategoryLabel, getVocabularyStudyFit, getVocabularyStudyNavigation, getVocabularyStudyProgress, type VocabularyStudyDensity } from '../vocabulary.presentation';
import { getDailyVocabulary } from '../vocabulary.service';
import type { DailyVocabularyLesson } from '../vocabulary.types';

type LoadState = { status: 'loading' | 'success' | 'error'; lesson: DailyVocabularyLesson | null };
type PronunciationSession = { wordId: string; expected: string };
type StudyFitState = { key: string; density: VocabularyStudyDensity; requiresScroll: boolean; ready: boolean };

export function VocabularyStudyScreen() {
  const styles = useThemedStyles(baseStyles);
  const [state, setState] = useState<LoadState>({ status: 'loading', lesson: null });
  const [index, setIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [pronunciationTranscripts, setPronunciationTranscripts] = useState<Record<string, string>>({});
  const [pronunciationCompleted, setPronunciationCompleted] = useState<Record<string, true>>({});
  const [pronunciationWordId, setPronunciationWordId] = useState<string | null>(null);
  const [fitState, setFitState] = useState<StudyFitState>({ key: '', density: 0, requiresScroll: false, ready: false });
  const [viewportHeight, setViewportHeight] = useState(0);
  const mounted = useRef(true);
  const loaded = useRef(false);
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const { activeKey: speechActiveKey, error: speechError, loadingKey: speechLoadingKey, play: playSpeech, stop: stopSpeech } = useVocabularySpeech();
  const pronunciationSession = useRef<PronunciationSession | null>(null);
  const onPronunciationTranscribed = useCallback((recognized: string) => {
    const session = pronunciationSession.current;
    pronunciationSession.current = null;
    setPronunciationWordId(null);
    if (!session) return;
    setPronunciationTranscripts((current) => ({ ...current, [session.wordId]: recognized }));
    if (compareVocabularyPronunciation(session.expected, recognized).status === 'recognized') {
      setPronunciationCompleted((current) => ({ ...current, [session.wordId]: true }));
    }
  }, []);
  const { cancelRecording: cancelPronunciation, error: pronunciationError, phase: pronunciationPhase,
    startRecording: startPronunciationRecording, stopRecording: stopPronunciationRecording } =
    useTranslatorVoice({ language: 'en', onTranscribed: onPronunciationTranscribed });
  const goToPractice = useCallback(() => router.replace('/practice'), []);
  useDeterministicBack(goToPractice);

  const loadLesson = useCallback(async (background = false) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    const currentRequestId = ++requestId.current;
    controllerRef.current = controller;
    if (!background && !loaded.current) setState((current) => ({ status: 'loading', lesson: current.lesson }));
    if (background) {
      setRefreshing(true);
      setRefreshError(false);
    }
    try {
      const lesson = await getDailyVocabulary(controller.signal);
      if (!mounted.current || currentRequestId !== requestId.current) return;
      setState({ status: 'success', lesson });
      loaded.current = true;
      setIndex((current) => Math.min(current, lesson.words.length - 1));
    } catch {
      if (!mounted.current || currentRequestId !== requestId.current) return;
      if (background) setRefreshError(true);
      else setState((current) => ({ status: 'error', lesson: current.lesson }));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (mounted.current && currentRequestId === requestId.current && background) setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    mounted.current = true;
    void loadLesson(loaded.current);
    return () => {
      mounted.current = false;
      requestId.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [loadLesson]));

  useEffect(() => {
    stopSpeech();
  }, [index, stopSpeech]);

  const lesson = state.lesson;
  const word = lesson?.words[index] ?? null;
  const recognized = word ? pronunciationTranscripts[word.id] ?? null : null;
  const completed = word ? Boolean(pronunciationCompleted[word.id]) : false;
  const progress = useMemo(
    () => word && lesson ? getVocabularyStudyProgress(index, lesson.words.length) : null,
    [index, lesson, word],
  );
  const navigation = useMemo(
    () => word && lesson ? getVocabularyStudyNavigation(index, lesson.words.length) : null,
    [index, lesson, word],
  );
  const layoutKey = JSON.stringify([
    word?.id, word?.word, word?.translation, word?.example, word?.exampleTranslation,
    word?.category, lesson?.category, pronunciationPhase, pronunciationError,
    recognized, completed, speechError, speechLoadingKey, refreshError, viewportHeight,
  ]);
  const currentFit = fitState.key === layoutKey ? fitState : null;
  const density: VocabularyStudyDensity = currentFit?.density ?? 0;
  const requiresScroll = currentFit?.requiresScroll ?? false;
  const layoutReady = currentFit?.ready ?? false;

  const refresh = useCallback(() => { void loadLesson(true); }, [loadLesson]);

  const startPronunciation = useCallback(() => {
    if (!word?.example) return;
    pronunciationSession.current = { wordId: word.id, expected: word.example };
    setPronunciationWordId(word.id);
    setPronunciationTranscripts((current) => {
      const next = { ...current };
      delete next[word.id];
      return next;
    });
    stopSpeech();
    void startPronunciationRecording();
  }, [startPronunciationRecording, stopSpeech, word]);

  const abandonRecordingForNavigation = useCallback(() => {
    if (pronunciationPhase === 'recording' || pronunciationPhase === 'requestingPermission') {
      pronunciationSession.current = null;
      setPronunciationWordId(null);
      void cancelPronunciation();
    }
  }, [cancelPronunciation, pronunciationPhase]);

  const goToPreviousWord = useCallback(() => {
    abandonRecordingForNavigation();
    setIndex((current) => Math.max(0, current - 1));
  }, [abandonRecordingForNavigation]);

  const goToNextWordOrQuiz = useCallback(() => {
    abandonRecordingForNavigation();
    if (!lesson || !navigation) return;
    if (navigation.isLast) router.push('/practice/vocabulary-quiz');
    else setIndex((current) => Math.min(lesson.words.length - 1, current + 1));
  }, [abandonRecordingForNavigation, lesson, navigation]);

  const onAudio = useCallback((key: VocabularySpeechKey, text: string) => {
    void playSpeech(key, text);
  }, [playSpeech]);

  if (state.status === 'loading' && !lesson) return <PageLoading label="Carregando suas palavras..." onBack={goToPractice} title="Vocabulário" />;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}><ScreenHeader onBack={goToPractice} right={progress ? <Text style={styles.headerCount}>{progress.label}</Text> : null} title="Vocabulário" /></View>
      {progress ? <View accessibilityLabel={`Progresso ${progress.label}`} accessibilityRole="progressbar" style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress.fraction * 100}%` }]} />
      </View> : null}
      <ScrollView
        key={layoutKey}
        style={[styles.scroll, lesson && word && !layoutReady && styles.measuring]}
        contentContainerStyle={[styles.content, density > 0 && styles.contentCompact, density === 2 && styles.contentTight]}
        onLayout={(event) => {
          const height = Math.round(event.nativeEvent.layout.height);
          setViewportHeight((current) => Math.abs(current - height) > 1 ? height : current);
        }}
        onContentSizeChange={(_width, height) => {
          if (!viewportHeight) return;
          const nextFit = getVocabularyStudyFit(density, viewportHeight, height);
          setFitState((current) => {
            const next = { key: layoutKey, density: nextFit.density, requiresScroll: nextFit.requiresScroll, ready: nextFit.density === density };
            return current.key === next.key && current.density === next.density && current.requiresScroll === next.requiresScroll && current.ready === next.ready ? current : next;
          });
        }}
        refreshControl={<RefreshControl colors={['#5b50f5']} onRefresh={() => void refresh()} refreshing={refreshing} tintColor="#5b50f5" />}
        showsVerticalScrollIndicator={requiresScroll}
      >
        {state.status === 'error' && !lesson ? (
          <View style={styles.state}>
            <Text style={styles.errorText}>Não foi possível carregar o vocabulário.</Text>
            <Pressable accessibilityRole="button" onPress={() => void loadLesson()} style={styles.retry}>
              <Text style={styles.retryText}>Tentar novamente</Text>
            </Pressable>
          </View>
        ) : null}
        {lesson && word && progress && navigation ? (
          <>
            {refreshError ? <View style={styles.refreshError}><Text style={styles.errorText}>Não foi possível atualizar suas palavras.</Text><Pressable accessibilityRole="button" onPress={refresh}><Text style={styles.retryText}>Tentar novamente</Text></Pressable></View> : null}
            <VocabularyStudyCard
              activeAudio={speechActiveKey}
              audioError={speechError}
              categoryLabel={getVocabularyCategoryLabel(word.category ?? lesson.category)}
              loadingAudio={speechLoadingKey}
              onPlayAudio={onAudio}
              density={density}
              word={word}
            />
            <VocabularyPronunciationPractice
              activeAudio={speechActiveKey === 'example'}
              completed={completed}
              density={density}
              error={pronunciationWordId === word.id ? pronunciationError : null}
              expected={word.example}
              loadingAudio={speechLoadingKey === 'example'}
              onCancel={() => {
                pronunciationSession.current = null;
                setPronunciationWordId(null);
                void cancelPronunciation();
              }}
              onPlaySentence={() => onAudio('example', word.example ?? '')}
              onStart={startPronunciation}
              onStop={() => void stopPronunciationRecording()}
              phase={pronunciationWordId === word.id || pronunciationPhase === 'transcribing' ? pronunciationPhase : 'idle'}
              recognized={recognized}
            />
          </>
        ) : null}
      </ScrollView>
      {lesson && word && navigation ? <View style={styles.navigation}>
        <Pressable
          accessibilityLabel="Palavra anterior"
          accessibilityRole="button"
          accessibilityState={{ disabled: !navigation.canGoPrevious }}
          disabled={!navigation.canGoPrevious}
          onPress={goToPreviousWord}
          style={({ pressed }) => [styles.secondaryButton, !navigation.canGoPrevious && styles.disabledButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>← Anterior</Text>
        </Pressable>
        <Pressable
          accessibilityLabel={navigation.isLast ? navigation.nextLabel : 'Próxima palavra'}
          accessibilityRole="button"
          onPress={goToNextWordOrQuiz}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.primaryButtonText}>{navigation.isLast ? navigation.nextLabel : 'Próxima palavra'}</Text>
          <Text style={styles.arrow}>→</Text>
        </Pressable>
      </View> : null}
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const baseStyles = StyleSheet.create({
  screen: { backgroundColor: '#f8f9ff', flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 2 },
  scroll: { flex: 1 },
  measuring: { opacity: 0 },
  content: { flexGrow: 1, paddingBottom: 8, paddingHorizontal: 16, paddingTop: 12 },
  contentCompact: { paddingBottom: 5, paddingTop: 7 },
  contentTight: { paddingBottom: 3, paddingTop: 4 },
  headerCount: { color: '#4d5773', fontSize: 13, fontWeight: '800' },
  refreshError: { alignItems: 'center', backgroundColor: '#fff4ee', borderColor: '#ffdccc', borderRadius: 11, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 12, paddingVertical: 10 },
  progressTrack: { backgroundColor: '#e2e5f0', borderRadius: 4, height: 7, marginHorizontal: 16, marginTop: 4, overflow: 'hidden' },
  progressFill: { backgroundColor: '#5b50f5', borderRadius: 5, height: '100%' },
  navigation: { flexDirection: 'row', gap: 9, paddingBottom: 12, paddingHorizontal: 16, paddingTop: 8 },
  secondaryButton: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#cbc6f3', borderRadius: 13, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 48 },
  primaryButton: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 13, flex: 1.4, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 48, paddingHorizontal: 8 },
  secondaryButtonText: { color: '#202044', fontSize: 14, fontWeight: '700' },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  arrow: { color: '#ffffff', fontSize: 21 },
  disabledButton: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
  state: { alignItems: 'center', justifyContent: 'center', minHeight: 360, padding: 25 },
  stateText: { color: '#68728c', fontSize: 14, marginTop: 13 },
  errorText: { color: '#8f4956', fontSize: 14, textAlign: 'center' },
  retry: { borderRadius: 10, marginTop: 13, paddingHorizontal: 14, paddingVertical: 10 },
  retryText: { color: '#5147df', fontSize: 14, fontWeight: '700' },
});

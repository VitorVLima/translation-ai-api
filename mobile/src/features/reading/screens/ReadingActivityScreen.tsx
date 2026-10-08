import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageLoading } from '../../../components/PageLoading';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { useDeterministicBack } from '../../../hooks/use-deterministic-back';
import { getBackDestination } from '../../../navigation/back-destinations';
import { useVocabularySpeech } from '../../vocabulary/audio/use-vocabulary-speech';
import { ReadingHintsSheet } from '../components/ReadingHintsSheet';
import { ReadingResultView } from '../components/ReadingResultView';
import {
  estimateReadingMinutes,
  getHighlightedReadingSegments,
  getReadingDifficultyCefr,
  getReadingDifficultyLabel,
  getReadingTopicLabel,
} from '../reading.presentation';
import { getReadingHintsForActivity, getReadingActivity, ReadingRequestError } from '../reading.service';
import type { ReadingActivityDetail, ReadingHint } from '../reading.types';

type Props = { onReturnToQuestions?: () => void };

export function ReadingActivityScreen({ onReturnToQuestions }: Props = {}) {
  const styles = useThemedStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const activityId = typeof id === 'string' ? id : '';
  const [detail, setDetail] = useState<ReadingActivityDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [hints, setHints] = useState<ReadingHint[] | null>(null);
  const [hintsEnabled, setHintsEnabled] = useState(false);
  const [selectedHintIndex, setSelectedHintIndex] = useState<number | null>(null);
  const [hintCardHeight, setHintCardHeight] = useState(0);
  const [hintsLoading, setHintsLoading] = useState(false);
  const [hintsError, setHintsError] = useState(false);
  const hintsInFlight = useRef(false);
  const hintRequestId = useRef(0);
  const loadRequestId = useRef(0);
  const mounted = useRef(true);
  const { activeKey, error: speechError, loadingKey, play: playSpeech, stop: stopSpeech } = useVocabularySpeech();
  const goBack = useCallback(() => {
    if (selectedHintIndex !== null) {
      setSelectedHintIndex(null);
      return false;
    }
    if (onReturnToQuestions) {
      onReturnToQuestions();
      return false;
    }
    if (hintsEnabled) {
      setHintsEnabled(false);
      return false;
    }
    router.replace(getBackDestination('readingActivity'));
  }, [hintsEnabled, onReturnToQuestions, selectedHintIndex]);
  useDeterministicBack(goBack);

  const load = useCallback(async () => {
    if (!activityId) { setStatus('error'); setError('Leitura inválida.'); return; }
    const requestId = ++loadRequestId.current;
    setStatus('loading');
    try {
      const result = await getReadingActivity(activityId);
      if (!mounted.current || requestId !== loadRequestId.current) return;
      setDetail(result); setHints(result.hints); setStatus('success'); setError(null);
    } catch (reason) {
      if (!mounted.current || requestId !== loadRequestId.current) return;
      setStatus('error'); setError(reason instanceof ReadingRequestError && reason.status === 404 ? 'Esta leitura não está disponível.' : 'Não foi possível carregar esta leitura.');
    }
  }, [activityId]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setHints(null);
      setHintsEnabled(false);
      setSelectedHintIndex(null);
      setHintsLoading(false);
      setHintsError(false);
      hintsInFlight.current = false;
      void load();
    });
    return () => {
      active = false;
      mounted.current = false;
      loadRequestId.current += 1;
      hintRequestId.current += 1;
      hintsInFlight.current = false;
      stopSpeech();
    };
  }, [load, stopSpeech]);

  const requestHints = useCallback(async () => {
    if (!detail || hintsInFlight.current) return;
    const requestId = ++hintRequestId.current;
    hintsInFlight.current = true;
    setHintsLoading(true);
    setHintsError(false);
    try {
      const result = await getReadingHintsForActivity(detail.activityId);
      if (mounted.current && requestId === hintRequestId.current) setHints(result);
    } catch {
      if (mounted.current && requestId === hintRequestId.current) setHintsError(true);
    } finally {
      if (requestId === hintRequestId.current) {
        hintsInFlight.current = false;
        if (mounted.current) setHintsLoading(false);
      }
    }
  }, [detail]);

  const toggleHints = useCallback(() => {
    if (hintsEnabled) {
      setHintsEnabled(false);
      setSelectedHintIndex(null);
      return;
    }
    setHintsEnabled(true);
    if (hints === null && !hintsInFlight.current) void requestHints();
  }, [hints, hintsEnabled, requestHints]);

  const segments = useMemo(() => getHighlightedReadingSegments(
    detail?.text ?? '', hintsEnabled && hints ? hints.map((hint) => hint.expression) : [],
  ), [detail?.text, hints, hintsEnabled]);

  if (status === 'loading' && !detail) return <PageLoading label="Carregando leitura..." onBack={goBack} title="Leitura" />;

  return <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
    <View style={styles.header}><ScreenHeader backAccessibilityLabel={onReturnToQuestions ? 'Voltar às perguntas' : undefined} onBack={goBack} title="Leitura" /></View>
    <ScrollView contentContainerStyle={[styles.content, selectedHintIndex !== null && { paddingBottom: hintCardHeight + 32 }]} showsVerticalScrollIndicator={false}>
      {onReturnToQuestions ? <Text style={styles.consultationBadge}>Consultando durante o quiz</Text> : null}
      {status === 'error' ? <View style={styles.center}><Text style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void load()}><Text style={styles.retry}>Tentar novamente</Text></Pressable></View> : null}
      {detail && status === 'success' ? <>
        <View style={styles.badges}>
          <Text style={styles.topicBadge}>{getReadingTopicLabel(detail.topic)}</Text>
          <Text style={styles.levelBadge}>{getReadingDifficultyLabel(detail.difficulty)} · {getReadingDifficultyCefr(detail.difficulty)}</Text>
        </View>
        <Text accessibilityRole="header" style={styles.title}>{detail.title?.trim() || getReadingTopicLabel(detail.topic)}</Text>
        <View style={styles.readingTime}>
          <SymbolView accessible={false} name={{ ios: 'clock', android: 'schedule', web: 'schedule' }} size={17} tintColor="#68728c" />
          <Text style={styles.readingTimeText}>{estimateReadingMinutes(detail.text)} min de leitura</Text>
        </View>
        <View style={styles.divider} />
        {detail.status !== 'IN_PROGRESS' ? <ReadingResultView detail={detail} onConclude={() => router.replace(getBackDestination('reading'))} /> : null}
        <Text style={styles.articleText}>
          {segments.map((segment, index) => <Text
            key={index}
            accessibilityRole={segment.highlighted ? 'button' : undefined}
            onPress={segment.hintIndex !== null ? () => setSelectedHintIndex(segment.hintIndex) : undefined}
            style={segment.highlighted ? styles.highlight : undefined}
          >{segment.text}</Text>)}
        </Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel={activeKey === 'word' ? 'Parar áudio' : 'Ouvir texto'}
            accessibilityRole="button"
            accessibilityState={{ busy: loadingKey === 'word', disabled: loadingKey !== null }}
            disabled={loadingKey !== null}
            onPress={() => void playSpeech('word', detail.text)}
            style={({ pressed }) => [styles.action, pressed && styles.pressed]}
          >
            {loadingKey === 'word' ? <ActivityIndicator color="#5b50f5" size="small" /> :
              <SymbolView accessible={false} name={activeKey === 'word' ? { ios: 'stop.fill', android: 'stop', web: 'stop' } : { ios: 'speaker.wave.2.fill', android: 'volume_up', web: 'volume_up' }} size={19} tintColor="#5b50f5" />}
            <Text style={styles.actionText}>{loadingKey === 'word' ? 'Carregando...' : activeKey === 'word' ? 'Parar áudio' : 'Ouvir texto'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: hintsEnabled }} onPress={toggleHints} style={({ pressed }) => [styles.action, hintsEnabled && styles.actionActive, pressed && styles.pressed]}>
            <SymbolView accessible={false} name={{ ios: 'lightbulb.fill', android: 'lightbulb', web: 'lightbulb' }} size={19} tintColor="#5b50f5" />
            <Text style={styles.actionText}>Dicas{hints?.length ? ` (${hints.length})` : ''}</Text>
            {hintsLoading ? <ActivityIndicator color="#5b50f5" size="small" /> : null}
          </Pressable>
        </View>
        {speechError ? <Text style={styles.localError}>{speechError}</Text> : null}
        {hintsEnabled && hintsError ? <Pressable accessibilityRole="button" onPress={() => void requestHints()}><Text style={styles.localError}>Não foi possível carregar as dicas. Tentar novamente</Text></Pressable> : null}
        {hintsEnabled && !hintsLoading && !hintsError && hints?.length === 0 ? <Text style={styles.localError}>Nenhuma dica disponível para este texto.</Text> : null}
        {(onReturnToQuestions || detail.status === 'IN_PROGRESS') ? <Pressable accessibilityRole="button" onPress={onReturnToQuestions ?? (() => router.push(`/practice/reading/${detail.activityId}/questions`))} style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>{onReturnToQuestions ? 'Voltar às perguntas' : 'Responder perguntas'}</Text>
          <SymbolView accessible={false} name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} size={20} tintColor="#ffffff" />
        </Pressable> : null}
      </> : null}
    </ScrollView>
    <ReadingHintsSheet hint={selectedHintIndex !== null ? hints?.[selectedHintIndex] ?? null : null} onClose={() => setSelectedHintIndex(null)} onHeightChange={setHintCardHeight} readingText={detail?.text ?? ''} />
    <StatusBar style="auto" />
  </SafeAreaView>;
}

const baseStyles = StyleSheet.create({
  screen: { backgroundColor: '#fbfbff', flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 2 },
  content: { alignSelf: 'center', maxWidth: 560, paddingBottom: 32, paddingHorizontal: 20, width: '100%' },
  consultationBadge: { alignSelf: 'flex-start', backgroundColor: '#eeecff', borderRadius: 9, color: '#5147df', fontSize: 12, fontWeight: '700', marginTop: 12, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 7 },
  center: { alignItems: 'center', justifyContent: 'center', minHeight: 380, padding: 24 },
  error: { color: '#984b58', fontSize: 14, textAlign: 'center' },
  retry: { color: '#5147df', fontSize: 14, fontWeight: '700', marginTop: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  topicBadge: { backgroundColor: '#ebe8ff', borderRadius: 9, color: '#5147df', fontSize: 12, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 7 },
  levelBadge: { backgroundColor: '#e3f7eb', borderRadius: 9, color: '#257348', fontSize: 12, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 7 },
  title: { color: '#171528', fontSize: 26, fontWeight: '800', lineHeight: 32, marginTop: 20 },
  readingTime: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 12 },
  readingTimeText: { color: '#68728c', fontSize: 13, fontWeight: '600' },
  divider: { backgroundColor: '#e6e8f1', height: 1, marginBottom: 20, marginTop: 22 },
  articleText: { color: '#242136', fontSize: 17, lineHeight: 29 },
  highlight: { color: '#5147df', fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 28 },
  action: { alignItems: 'center', backgroundColor: '#ebe8ff', borderRadius: 13, flexBasis: 148, flexDirection: 'row', flexGrow: 1, gap: 8, justifyContent: 'center', minHeight: 50, paddingHorizontal: 11 },
  actionActive: { backgroundColor: '#ddd7ff', borderColor: '#5b50f5', borderWidth: 1 },
  actionText: { color: '#5147df', fontSize: 14, fontWeight: '700' },
  localError: { color: '#984b58', fontSize: 12, marginTop: 8 },
  primary: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 14, flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 14, minHeight: 52, paddingHorizontal: 14 },
  primaryText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.78 },
});

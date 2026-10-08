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
import { getReadingActivity, getReadingQuestions, ReadingRequestError, submitReadingAnswers } from '../reading.service';
import { getReadingQuestionTypeLabel } from '../reading.presentation';
import type { ReadingActivityDetail, ReadingQuestion } from '../reading.types';
import { ReadingResultView } from '../components/ReadingResultView';
import { ReadingActivityScreen } from './ReadingActivityScreen';

type Phase = 'loading' | 'quiz' | 'submitting' | 'resultLoading' | 'result' | 'error' | 'resultError';

export function ReadingQuestionsScreen() {
  const styles = useThemedStyles(baseStyles);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const activityId = typeof id === 'string' ? id : '';
  const [phase, setPhase] = useState<Phase>('loading');
  const [questions, setQuestions] = useState<ReadingQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [consultingText, setConsultingText] = useState(false);
  const [resultDetail, setResultDetail] = useState<ReadingActivityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const submitted = useRef(false);
  const submissionInFlight = useRef(false);
  const mounted = useRef(true);
  const loadedQuestions = useRef<{ activityId: string; value: ReadingQuestion[] } | null>(null);
  const failedActivityId = useRef<string | null>(null);
  const failedMessage = useRef<string | null>(null);
  const questionsRequest = useRef<{ activityId: string; promise: Promise<ReadingQuestion[]> } | null>(null);

  const goBack = useCallback(() => {
    const destination = phase === 'result' || phase === 'resultError' || phase === 'resultLoading'
      ? getBackDestination('reading')
      : activityId ? `/practice/reading/${activityId}` : '/practice/reading';
    router.replace(destination);
  }, [activityId, phase]);
  useDeterministicBack(goBack, !consultingText);

  const loadQuestions = useCallback(async (force = false) => {
    if (!activityId) { setPhase('error'); setError('Leitura inválida.'); return; }
    if (!force && loadedQuestions.current?.activityId === activityId) {
      if (mounted.current) {
        setQuestions(loadedQuestions.current.value);
        setCurrentIndex(0);
        setAnswers({});
        setPhase('quiz');
      }
      return;
    }
    if (!force && failedActivityId.current === activityId) {
      if (mounted.current) {
        setPhase('error');
        setError(failedMessage.current ?? 'N\u00e3o foi poss\u00edvel carregar as perguntas.');
      }
      return;
    }
    if (force) {
      loadedQuestions.current = null;
      failedActivityId.current = null;
      failedMessage.current = null;
    }
    setPhase('loading');
    setError(null);
    const request = questionsRequest.current?.activityId === activityId
      ? questionsRequest.current.promise
      : getReadingQuestions(activityId);
    questionsRequest.current = { activityId, promise: request };
    try {
      const loaded = await request;
      loadedQuestions.current = { activityId, value: loaded };
      failedActivityId.current = null;
      if (!mounted.current) return;
      setQuestions(loaded);
      setCurrentIndex(0);
      setAnswers({});
      setPhase('quiz');
    } catch (reason) {
      failedActivityId.current = activityId;
      failedMessage.current = reason instanceof ReadingRequestError && reason.status === 404
        ? 'Esta leitura n\u00e3o est\u00e1 dispon\u00edvel.'
        : 'N\u00e3o foi poss\u00edvel carregar as perguntas.';
      if (mounted.current) {
        setPhase('error');
        setError(failedMessage.current);
      }
    } finally {
      if (questionsRequest.current?.promise === request) questionsRequest.current = null;
    }
  }, [activityId]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    queueMicrotask(() => { if (active) void loadQuestions(); });
    return () => { active = false; mounted.current = false; };
  }, [loadQuestions]);

  const currentQuestion = questions[currentIndex] ?? null;
  const selectedOption = currentQuestion ? answers[currentQuestion.id] : undefined;
  const progress = questions.length > 0 ? (currentIndex + 1) / questions.length : 0;
  const answeredCount = questions.reduce((count, question) => count + (typeof answers[question.id] === 'number' ? 1 : 0), 0);
  const allAnswered = questions.length > 0 && answeredCount === questions.length;

  const loadResult = useCallback(async () => {
    if (!activityId || !submitted.current) return;
    if (!mounted.current) return;
    setPhase('resultLoading');
    setError(null);
    try {
      const detail = await getReadingActivity(activityId);
      if (!mounted.current) return;
      setResultDetail(detail);
      setPhase('result');
    } catch {
      if (mounted.current) {
        setPhase('resultError');
        setError('Não foi possível carregar o resultado.');
      }
    }
  }, [activityId]);

  const submit = useCallback(async () => {
    if (phase !== 'quiz' || submitted.current || submissionInFlight.current || !activityId || questions.length !== 3) return;
    if (!questions.every((question) => typeof answers[question.id] === 'number')) return;
    submissionInFlight.current = true;
    setPhase('submitting');
    setError(null);
    try {
      await submitReadingAnswers(activityId, questions.map((question) => ({ questionId: question.id, selectedOption: answers[question.id] })));
      if (!mounted.current) return;
      submitted.current = true;
      await loadResult();
    } catch (reason) {
      if (!mounted.current) return;
      setPhase('quiz');
      setError(reason instanceof ReadingRequestError && reason.status === 404 ? 'Esta leitura não está disponível.' : 'Não foi possível enviar suas respostas. Tente novamente.');
    } finally {
      if (!submitted.current) submissionInFlight.current = false;
    }
  }, [activityId, answers, loadResult, phase, questions]);

  const goToPreviousQuestion = useCallback(() => {
    if (phase !== 'quiz' || currentIndex <= 0) return;
    setCurrentIndex((value) => Math.max(0, value - 1));
  }, [currentIndex, phase]);

  const goToNextQuestion = useCallback(() => {
    if (phase !== 'quiz' || currentIndex >= questions.length - 1) return;
    setCurrentIndex((value) => Math.min(questions.length - 1, value + 1));
  }, [currentIndex, phase, questions.length]);

  const selectOption = useCallback((option: number) => {
    if (!currentQuestion || phase !== 'quiz') return;
    setAnswers((current) => ({ ...current, [currentQuestion.id]: option }));
  }, [currentQuestion, phase]);

  const retry = useCallback(() => {
    if (phase === 'resultError') void loadResult();
    else {
      void loadQuestions(true);
    }
  }, [loadQuestions, loadResult, phase]);

  const returnToQuestions = useCallback(() => setConsultingText(false), []);
  const resultAnswers = useMemo(() => answers, [answers]);

  if (consultingText) return <ReadingActivityScreen onReturnToQuestions={returnToQuestions} />;
  if (phase === 'loading') return <PageLoading label="Carregando perguntas..." onBack={goBack} title="Perguntas" />;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}><ScreenHeader backAccessibilityLabel={phase === 'result' || phase === 'resultError' || phase === 'resultLoading' ? 'Voltar às leituras' : 'Voltar à leitura'} onBack={goBack} title={phase === 'result' || phase === 'resultError' || phase === 'resultLoading' ? 'Resultado' : 'Perguntas'} /></View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {phase === 'error' ? <View style={styles.state}><Text style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void retry()}><Text style={styles.retry}>Tentar novamente</Text></Pressable></View> : null}
        {(phase === 'quiz' || phase === 'submitting') && currentQuestion ? (
          <View>
            <View style={styles.progressHeader}>
              <View>
                <Text style={styles.position}>Questão {currentIndex + 1} de {questions.length}</Text>
                <Text style={styles.answeredCount}>{answeredCount} de {questions.length} respondidas</Text>
              </View>
              {phase === 'quiz' ? <Pressable accessibilityLabel="Ver texto da leitura" accessibilityRole="button" onPress={() => setConsultingText(true)} style={({ pressed }) => [styles.viewTextButton, pressed && styles.pressed]}><Text style={styles.viewTextLabel}>Ver texto</Text></Pressable> : null}
            </View>
            <View accessibilityLabel={`Progresso da questão ${currentIndex + 1} de 3`} accessibilityRole="progressbar" style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress * 100}%` }]} /></View>
            <View style={styles.navigationActions}>
              {currentIndex > 0 ? <Pressable accessibilityLabel="Pergunta anterior" accessibilityRole="button" disabled={phase === 'submitting'} onPress={goToPreviousQuestion} style={({ pressed }) => [styles.secondaryAction, phase === 'submitting' && styles.disabled, pressed && styles.pressed]}><SymbolView accessible={false} name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }} size={19} tintColor="#5147df" /></Pressable> : <View style={styles.navigationSpacer} />}
              {currentIndex < questions.length - 1 ? <Pressable accessibilityLabel="Próxima pergunta" accessibilityRole="button" disabled={phase === 'submitting'} onPress={goToNextQuestion} style={({ pressed }) => [styles.secondaryAction, phase === 'submitting' && styles.disabled, pressed && styles.pressed]}><SymbolView accessible={false} name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={19} tintColor="#5147df" /></Pressable> : <View style={styles.navigationSpacer} />}
            </View>
            <View style={styles.questionCard}>
              <Text style={styles.type}>{getReadingQuestionTypeLabel(currentQuestion.type)}</Text>
              <Text style={styles.question}>{currentQuestion.question}</Text>
              <View style={styles.options}>
                {currentQuestion.options.map((option, optionIndex) => {
                  const selected = selectedOption === optionIndex;
                  return <Pressable key={`${currentQuestion.id}-${optionIndex}`} accessibilityRole="button" accessibilityState={{ selected }} onPress={() => selectOption(optionIndex)} style={({ pressed }) => [styles.option, selected && styles.selectedOption, pressed && styles.pressed]}><Text style={[styles.optionLetter, selected && styles.selectedText]}>{String.fromCharCode(65 + optionIndex)}</Text><Text style={[styles.optionText, selected && styles.selectedText]}>{option}</Text></Pressable>;
                })}
              </View>
            </View>
            {allAnswered ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: phase === 'submitting' }} disabled={phase === 'submitting'} onPress={() => void submit()} style={({ pressed }) => [styles.primary, phase === 'submitting' && styles.disabled, pressed && styles.pressed]}>
              {phase === 'submitting' ? <><ActivityIndicator color="#ffffff" /><Text style={styles.primaryText}>Encerrando...</Text></> : <Text style={styles.primaryText}>Encerrar</Text>}
            </Pressable> : currentIndex === questions.length - 1 ? <Text style={styles.incompleteMessage}>Responda todas as perguntas para encerrar.</Text> : null}
            {error ? <Text style={styles.localError}>{error}</Text> : null}
          </View>
        ) : null}
        {phase === 'resultLoading' ? <View style={styles.state}><ActivityIndicator color="#5b50f5" size="large" /><Text style={styles.muted}>Carregando resultado...</Text></View> : null}
        {phase === 'resultError' ? <View style={styles.state}><Text style={styles.error}>{error}</Text><Pressable accessibilityRole="button" onPress={() => void retry()}><Text style={styles.retry}>Tentar novamente</Text></Pressable></View> : null}
        {phase === 'result' && resultDetail ? <ReadingResultView answers={resultAnswers} detail={resultDetail} onConclude={() => router.replace(getBackDestination('reading'))} /> : null}
      </ScrollView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const baseStyles = StyleSheet.create({
  screen: { backgroundColor: '#f8f9ff', flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 2 },
  content: { flexGrow: 1, paddingBottom: 16, paddingHorizontal: 16 },
  progressHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  position: { color: '#68728c', fontSize: 12, fontWeight: '700' },
  answeredCount: { color: '#8790a6', fontSize: 12, marginTop: 3 },
  viewTextButton: { alignItems: 'center', backgroundColor: '#eeecff', borderRadius: 10, justifyContent: 'center', minHeight: 38, paddingHorizontal: 13 },
  viewTextLabel: { color: '#5147df', fontSize: 13, fontWeight: '700' },
  progressTrack: { backgroundColor: '#e2e5f0', borderRadius: 4, height: 6, marginTop: 6, overflow: 'hidden' },
  progressFill: { backgroundColor: '#5b50f5', borderRadius: 4, height: '100%' },
  questionCard: { backgroundColor: '#ffffff', borderColor: '#e5e7f0', borderRadius: 16, borderWidth: 1, marginTop: 10, padding: 13 },
  type: { color: '#5b50f5', fontSize: 12, fontWeight: '800' },
  question: { color: '#202044', fontSize: 19, fontWeight: '800', lineHeight: 26, marginTop: 5 },
  options: { gap: 6, marginTop: 10 },
  option: { alignItems: 'center', borderColor: '#e1e4ef', borderRadius: 11, borderWidth: 1, flexDirection: 'row', minHeight: 44, paddingHorizontal: 9, paddingVertical: 5 },
  selectedOption: { backgroundColor: '#eeecff', borderColor: '#5b50f5', borderWidth: 1.5 },
  optionLetter: { alignItems: 'center', backgroundColor: '#f0f1f7', borderRadius: 13, color: '#626c85', fontSize: 12, fontWeight: '800', height: 26, lineHeight: 26, marginRight: 8, textAlign: 'center', width: 26 },
  optionText: { color: '#3c4560', flex: 1, fontSize: 15, lineHeight: 21 },
  selectedText: { color: '#4f45d8' },
  primary: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 14, justifyContent: 'center', marginTop: 14, minHeight: 50 },
  primaryText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  navigationActions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  navigationSpacer: { flex: 1 },
  secondaryAction: { alignItems: 'center', backgroundColor: '#eeecff', borderRadius: 12, height: 44, justifyContent: 'center', width: 44 },
  incompleteMessage: { color: '#68728c', fontSize: 12, marginTop: 8, textAlign: 'center' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
  state: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 360, padding: 24 },
  muted: { color: '#68728c', fontSize: 14, marginTop: 12, textAlign: 'center' },
  error: { color: '#984b58', fontSize: 14, textAlign: 'center' },
  retry: { color: '#5147df', fontSize: 14, fontWeight: '700', marginTop: 12 },
  localError: { color: '#984b58', fontSize: 12, marginTop: 9, textAlign: 'center' },
});

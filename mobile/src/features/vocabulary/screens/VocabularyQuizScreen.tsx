import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageLoading } from '../../../components/PageLoading';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { useDeterministicBack } from '../../../hooks/use-deterministic-back';
import {
  buildVocabularyQuizQuestions,
  getVocabularyEvaluationStatusLabel,
} from '../vocabulary.presentation';
import {
  evaluateVocabularySentence,
  getDailyVocabulary,
  submitVocabularyQuiz,
  VocabularyActionError,
} from '../vocabulary.service';
import type {
  DailyVocabularyLesson,
  VocabularyEvaluationResult,
  VocabularyQuizAnswer,
  VocabularyQuizResult,
} from '../vocabulary.types';

type QuizPhase = 'loading' | 'quiz' | 'challenge' | 'result' | 'error';

function actionErrorMessage(error: unknown, operation: 'quiz' | 'evaluate'): string {
  if (error instanceof VocabularyActionError) {
    if (error.status === 400) return operation === 'quiz' ? 'Não foi possível confirmar essas respostas.' : 'Revise a frase e tente novamente.';
    if (error.status === 409) return 'Esta lição já foi atualizada. Recarregue os dados para continuar.';
    if (error.status === 503) return 'O serviço está temporariamente indisponível. Tente novamente.';
  }
  return operation === 'quiz' ? 'Não foi possível enviar o quiz. Tente novamente.' : 'Não foi possível avaliar sua frase. Tente novamente.';
}

export function VocabularyQuizScreen() {
  const styles = useThemedStyles(baseStyles);
  const [phase, setPhase] = useState<QuizPhase>('loading');
  const [lesson, setLesson] = useState<DailyVocabularyLesson | null>(null);
  const [quizResult, setQuizResult] = useState<VocabularyQuizResult | null>(null);
  const [evaluation, setEvaluation] = useState<VocabularyEvaluationResult | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answers, setAnswers] = useState<VocabularyQuizAnswer[]>([]);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [sentence, setSentence] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const mounted = useRef(true);
  const actionInFlight = useRef(false);
  const goToVocabulary = useCallback(() => router.replace('/practice/vocabulary'), []);
  const goToPractice = useCallback(() => router.replace('/practice'), []);
  useDeterministicBack(goToVocabulary);

  const loadLesson = useCallback(async () => {
    setPhase('loading');
    setError(null);
    try {
      const data = await getDailyVocabulary();
      if (!mounted.current) return;
      setLesson(data);
      if (data.progress.writingCompleted || data.progress.completedAt) {
        setQuizResult(data.progress.quizScore === null ? null : { score: data.progress.quizScore, total: 3, progress: data.progress });
        setPhase('result');
      } else if (data.progress.quizCompleted) {
        setQuizResult(data.progress.quizScore === null ? null : { score: data.progress.quizScore, total: 3, progress: data.progress });
        setPhase('challenge');
      } else {
        setPhase('quiz');
      }
    } catch {
      if (mounted.current) {
        setError('Não foi possível carregar o quiz de hoje.');
        setPhase('error');
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    queueMicrotask(() => { if (active) void loadLesson(); });
    return () => { active = false; mounted.current = false; };
  }, [loadLesson]);

  const questions = useMemo(() => lesson ? buildVocabularyQuizQuestions(lesson) : [], [lesson]);
  const question = questions[questionIndex] ?? null;

  const confirmQuestion = useCallback(async () => {
    if (!lesson || !question || !selectedAnswer || submitting || actionInFlight.current) return;
    actionInFlight.current = true;
    const answer: VocabularyQuizAnswer = { selectedWordId: selectedAnswer, wordId: question.target.id };
    const nextAnswers = [...answers.filter((item) => item.wordId !== answer.wordId), answer];
    setError(null);
    try {
      if (questionIndex < questions.length - 1) {
        setAnswers(nextAnswers);
        setQuestionIndex((current) => current + 1);
        setSelectedAnswer(null);
        return;
      }
      setSubmitting(true);
      try {
        const result = await submitVocabularyQuiz(lesson.id, nextAnswers);
        if (!mounted.current) return;
        setAnswers(nextAnswers);
        setQuizResult(result);
        setSelectedWordId(null);
        setPhase('challenge');
      } catch (actionError) {
        if (mounted.current) setError(actionErrorMessage(actionError, 'quiz'));
      } finally {
        if (mounted.current) setSubmitting(false);
      }
    } finally {
      actionInFlight.current = false;
    }
  }, [answers, lesson, question, questionIndex, questions.length, selectedAnswer, submitting]);

  const evaluateSentence = useCallback(async () => {
    if (!lesson || !selectedWordId || !sentence.trim() || sentence.trim().length > 1000 || submitting || actionInFlight.current) return;
    actionInFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const result = await evaluateVocabularySentence(lesson.id, selectedWordId, sentence.trim());
      if (!mounted.current) return;
      setEvaluation(result);
      setPhase('result');
    } catch (actionError) {
      if (mounted.current) setError(actionErrorMessage(actionError, 'evaluate'));
    } finally {
      if (mounted.current) setSubmitting(false);
      actionInFlight.current = false;
    }
  }, [lesson, selectedWordId, sentence, submitting]);

  if (phase === 'loading') return <PageLoading label="Carregando seu quiz..." onBack={goToVocabulary} title="Quiz de vocabulário" />;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}><ScreenHeader onBack={goToVocabulary} title="Quiz de vocabulário" /></View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {phase === 'error' ? <ErrorState message={error ?? 'Não foi possível carregar o quiz.'} onRetry={() => void loadLesson()} /> : null}
          {phase === 'quiz' && question ? (
            <QuizQuestionView
              error={error}
              index={questionIndex}
              question={question}
              selectedAnswer={selectedAnswer}
              submitting={submitting}
              total={questions.length}
              onConfirm={() => void confirmQuestion()}
              onSelect={setSelectedAnswer}
            />
          ) : null}
          {phase === 'challenge' && lesson ? (
            <ChallengeView
              error={error}
              lesson={lesson}
              selectedWordId={selectedWordId}
              sentence={sentence}
              submitting={submitting}
              onEvaluate={() => void evaluateSentence()}
              onSelectWord={setSelectedWordId}
              onSentenceChange={setSentence}
            />
          ) : null}
          {phase === 'result' ? (
            <ResultView evaluation={evaluation} quizResult={quizResult} selectedWord={lesson?.words.find((item) => item.id === selectedWordId)?.word ?? null} sentence={sentence} onDone={goToPractice} />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const styles = useThemedStyles(baseStyles);
  return <View style={styles.state}><Text style={styles.errorText}>{message}</Text><Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}><Text style={styles.retryText}>Tentar novamente</Text></Pressable></View>;
}

function QuizQuestionView({ error, index, question, selectedAnswer, submitting, total, onConfirm, onSelect }: {
  error: string | null;
  index: number;
  question: ReturnType<typeof buildVocabularyQuizQuestions>[number];
  selectedAnswer: string | null;
  submitting: boolean;
  total: number;
  onConfirm: () => void;
  onSelect: (id: string) => void;
}) {
  const styles = useThemedStyles(baseStyles);
  const progress = ((index + 1) / total) * 100;
  return (
    <View style={styles.mainBlock}>
      <View style={styles.quizHeading}><Text style={styles.eyebrow}>QUIZ</Text><Text style={styles.counter}>Questão {index + 1} de {total}</Text></View>
      <View accessibilityLabel={`Progresso da questão ${index + 1} de ${total}`} accessibilityRole="progressbar" style={styles.progressTrack}><View style={[styles.progressFill, { width: `${progress}%` }]} /></View>
      <View style={styles.instruction}><Text style={styles.instructionTitle}>Complete a frase</Text><Text style={styles.instructionText}>Escolha a palavra correta.</Text></View>
      <View style={styles.prompt}><Text style={styles.promptText}>{question.prompt}</Text></View>
      <View style={styles.options}>{question.options.map((option) => {
        const selected = selectedAnswer === option.id;
        return <Pressable accessibilityRole="radio" accessibilityState={{ selected }} key={option.id} onPress={() => onSelect(option.id)} style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}><Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.word}</Text></Pressable>;
      })}</View>
      {error ? <Text accessibilityLiveRegion="polite" style={styles.inlineError}>{error}</Text> : null}
      <Pressable accessibilityRole="button" disabled={!selectedAnswer || submitting} onPress={onConfirm} style={({ pressed }) => [styles.primaryButton, (!selectedAnswer || submitting) && styles.disabledButton, pressed && styles.pressed]}>
        {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>{index === total - 1 ? 'Ver resultado' : 'Confirmar'}</Text>}
      </Pressable>
    </View>
  );
}

function ChallengeView({ error, lesson, selectedWordId, sentence, submitting, onEvaluate, onSelectWord, onSentenceChange }: {
  error: string | null;
  lesson: DailyVocabularyLesson;
  selectedWordId: string | null;
  sentence: string;
  submitting: boolean;
  onEvaluate: () => void;
  onSelectWord: (id: string) => void;
  onSentenceChange: (value: string) => void;
}) {
  const styles = useThemedStyles(baseStyles);
  return (
    <View style={styles.mainBlock}>
      <Text style={styles.eyebrow}>DESAFIO FINAL</Text>
      <Text style={styles.pageTitle}>Use uma palavra em uma frase</Text>
      <Text style={styles.pageDescription}>Escreva uma frase em inglês usando qualquer palavra de hoje.</Text>
      <Text style={styles.fieldLabel}>Escolha uma palavra</Text>
      <View style={styles.wordGrid}>{lesson.words.map((word) => <Pressable accessibilityRole="radio" accessibilityState={{ selected: selectedWordId === word.id }} key={word.id} onPress={() => onSelectWord(word.id)} style={({ pressed }) => [styles.wordChip, selectedWordId === word.id && styles.wordChipSelected, pressed && styles.pressed]}><Text numberOfLines={1} style={[styles.wordChipText, selectedWordId === word.id && styles.wordChipTextSelected]}>{word.word}</Text></Pressable>)}</View>
      <Text style={styles.fieldLabel}>Sua frase</Text>
      <TextInput accessibilityLabel="Frase em inglês" autoCapitalize="sentences" maxLength={1000} multiline onChangeText={onSentenceChange} placeholder="Digite sua frase em inglês..." placeholderTextColor="#8991a8" style={styles.sentenceInput} textAlignVertical="top" value={sentence} />
      <Text style={styles.characterCount}>{sentence.length}/1000</Text>
      {error ? <Text accessibilityLiveRegion="polite" style={styles.inlineError}>{error}</Text> : null}
      <Pressable accessibilityRole="button" disabled={!selectedWordId || !sentence.trim() || submitting} onPress={onEvaluate} style={({ pressed }) => [styles.primaryButton, (!selectedWordId || !sentence.trim() || submitting) && styles.disabledButton, pressed && styles.pressed]}>
        {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Avaliar frase</Text>}
      </Pressable>
    </View>
  );
}

function ResultView({ evaluation, quizResult, selectedWord, sentence, onDone }: { evaluation: VocabularyEvaluationResult | null; quizResult: VocabularyQuizResult | null; selectedWord: string | null; sentence: string; onDone: () => void }) {
  const styles = useThemedStyles(baseStyles);
  const hasCorrection = Boolean(evaluation?.correctedSentence && evaluation.correctedSentence.trim() !== sentence.trim());
  return (
    <View style={styles.mainBlock}>
      <View style={styles.resultIcon}><Text style={styles.resultIconText}>✓</Text></View>
      <Text style={styles.resultTitle}>{evaluation ? getVocabularyEvaluationStatusLabel(evaluation.status) : 'Lição concluída'}</Text>
      {quizResult ? <Text style={styles.resultScore}>Quiz: {quizResult.score} de {quizResult.total}</Text> : null}
      {evaluation ? <>
        {selectedWord ? <Text style={styles.resultMeta}>Palavra: {selectedWord}</Text> : null}
        {sentence ? <View style={styles.resultBox}><Text style={styles.resultLabel}>Sua frase</Text><Text style={styles.resultText}>{sentence}</Text></View> : null}
        {hasCorrection ? <View style={styles.correctionBox}><Text style={styles.resultLabel}>Sugestão de correção</Text><Text style={styles.resultText}>{evaluation.correctedSentence}</Text></View> : null}
        <View style={styles.resultBox}><Text style={styles.resultLabel}>Explicação</Text><Text style={styles.resultText}>{evaluation.explanation}</Text></View>
        {evaluation.alternative ? <View style={styles.resultBox}><Text style={styles.resultLabel}>Alternativa</Text><Text style={styles.resultText}>{evaluation.alternative}</Text></View> : null}
      </> : <Text style={styles.pageDescription}>Esta lição já foi concluída conforme os dados salvos.</Text>}
      <Pressable accessibilityRole="button" onPress={onDone} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>Concluir</Text></Pressable>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  screen: { backgroundColor: '#f8f9ff', flex: 1 },
  flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 2 },
  content: { flexGrow: 1, paddingBottom: 18, paddingHorizontal: 18 },
  mainBlock: { flex: 1, paddingTop: 5 },
  quizHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { color: '#5b50f5', fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  counter: { color: '#68728c', fontSize: 13, fontWeight: '700' },
  progressTrack: { backgroundColor: '#e2e5f0', borderRadius: 5, height: 8, marginTop: 9, overflow: 'hidden' },
  progressFill: { backgroundColor: '#5b50f5', borderRadius: 5, height: '100%' },
  instruction: { backgroundColor: '#eeecff', borderRadius: 16, marginTop: 14, padding: 13 },
  instructionTitle: { color: '#202044', fontSize: 16, fontWeight: '800' },
  instructionText: { color: '#697693', fontSize: 12, marginTop: 3 },
  prompt: { backgroundColor: '#ffffff', borderRadius: 16, marginTop: 12, padding: 16 },
  promptText: { color: '#202044', fontSize: 19, lineHeight: 27 },
  options: { gap: 8, marginTop: 12 },
  option: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#dfe3ee', borderRadius: 13, borderWidth: 1, justifyContent: 'center', minHeight: 46, paddingHorizontal: 14 },
  optionSelected: { backgroundColor: '#efedff', borderColor: '#5b50f5', borderWidth: 2 },
  optionText: { color: '#222743', fontSize: 15, fontWeight: '600' },
  optionTextSelected: { color: '#5147df', fontWeight: '800' },
  primaryButton: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 14, justifyContent: 'center', marginTop: 14, minHeight: 50, paddingHorizontal: 16 },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  pageTitle: { color: '#171528', fontSize: 23, fontWeight: '800', marginTop: 8 },
  pageDescription: { color: '#697693', fontSize: 14, lineHeight: 20, marginTop: 5 },
  fieldLabel: { color: '#4d5773', fontSize: 13, fontWeight: '800', marginBottom: 7, marginTop: 15 },
  wordGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  wordChip: { backgroundColor: '#ffffff', borderColor: '#dfe3ee', borderRadius: 10, borderWidth: 1, minHeight: 36, justifyContent: 'center', maxWidth: '48%', paddingHorizontal: 11 },
  wordChipSelected: { backgroundColor: '#efedff', borderColor: '#5b50f5' },
  wordChipText: { color: '#303750', fontSize: 13, fontWeight: '600' },
  wordChipTextSelected: { color: '#5147df', fontWeight: '800' },
  sentenceInput: { backgroundColor: '#ffffff', borderColor: '#dfe3ee', borderRadius: 14, borderWidth: 1, color: '#202044', fontSize: 15, minHeight: 92, padding: 13 },
  characterCount: { color: '#7b849b', fontSize: 11, marginTop: 4, textAlign: 'right' },
  inlineError: { color: '#984b59', fontSize: 12, marginTop: 9 },
  state: { alignItems: 'center', justifyContent: 'center', minHeight: 360, padding: 25 },
  stateText: { color: '#68728c', fontSize: 14, marginTop: 13 },
  errorText: { color: '#8f4956', fontSize: 14, textAlign: 'center' },
  retry: { borderRadius: 10, marginTop: 13, paddingHorizontal: 14, paddingVertical: 10 },
  retryText: { color: '#5147df', fontSize: 14, fontWeight: '700' },
  resultIcon: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#ddf4e8', borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  resultIconText: { color: '#247a55', fontSize: 28, fontWeight: '800' },
  resultTitle: { color: '#171528', fontSize: 23, fontWeight: '800', marginTop: 11, textAlign: 'center' },
  resultScore: { color: '#5b50f5', fontSize: 16, fontWeight: '800', marginTop: 7, textAlign: 'center' },
  resultMeta: { color: '#697693', fontSize: 13, marginTop: 12, textAlign: 'center' },
  resultBox: { backgroundColor: '#ffffff', borderRadius: 13, marginTop: 10, padding: 12 },
  correctionBox: { backgroundColor: '#eeecff', borderRadius: 13, marginTop: 10, padding: 12 },
  resultLabel: { color: '#697693', fontSize: 12, fontWeight: '800' },
  resultText: { color: '#252a46', fontSize: 14, lineHeight: 20, marginTop: 4 },
  disabledButton: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
});

import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useTheme } from '../../../theme/ThemeProvider';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL } from '../../../config/api';
import { PageLoading } from '../../../components/PageLoading';
import { useDeterministicBack } from '../../../hooks/use-deterministic-back';
import { getBackDestination } from '../../../navigation/back-destinations';
import { getProfile } from '../../profile/profile.service';
import { ConversationDifficultyCard } from '../components/ConversationDifficultyCard';
import { ConversationModeCard } from '../components/ConversationModeCard';
import { ConversationScenarioCard } from '../components/ConversationScenarioCard';
import {
  buildCreateConversationRequest,
  CONVERSATION_DIFFICULTY_OPTIONS,
  CONVERSATION_MODE_OPTIONS,
  DEFAULT_CONVERSATION_MODE,
  getConversationCreateErrorMessage,
  getConversationScenarioPresentation,
  recommendedConversationDifficulty,
} from '../conversations.presentation';
import { ConversationCreateError, createConversation, getConversationScenarios } from '../conversations.service';
import type { ConversationDifficulty, ConversationMode, ConversationScenario } from '../conversations.types';

type LoadStatus = 'loading' | 'success' | 'error';
type WizardStep = 1 | 2 | 3;

const DIFFICULTY_ICONS: Record<ConversationDifficulty, SymbolViewProps['name']> = {
  BEGINNER: { ios: 'leaf.fill', android: 'spa', web: 'spa' },
  INTERMEDIATE: { ios: 'chart.bar.fill', android: 'trending_up', web: 'trending_up' },
  ADVANCED: { ios: 'crown.fill', android: 'workspace_premium', web: 'workspace_premium' },
};

const MODE_ICONS: Record<ConversationMode, SymbolViewProps['name']> = {
  TEXT: { ios: 'message.fill', android: 'chat_bubble', web: 'chat_bubble' },
  VOICE: { ios: 'mic.fill', android: 'mic', web: 'mic' },
};

const STEP_COPY: Record<WizardStep, { title: string; description: string }> = {
  1: { title: 'Escolha um tema', description: 'Escolha o que você quer praticar nesta conversa.' },
  2: { title: 'Escolha seu nível', description: 'Escolha a dificuldade ideal para esta conversa.' },
  3: { title: 'Como você quer conversar?', description: 'Escolha como prefere praticar nesta conversa.' },
};

export function CreateConversationScreen() {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [step, setStep] = useState<WizardStep>(1);
  const [scenarios, setScenarios] = useState<ConversationScenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<ConversationDifficulty>('INTERMEDIATE');
  const [selectedMode, setSelectedMode] = useState<ConversationMode>(DEFAULT_CONVERSATION_MODE);
  const [recommendedDifficulty, setRecommendedDifficulty] = useState<ConversationDifficulty | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const requestId = useRef(0);
  const difficultyTouched = useRef(false);
  const creationInFlight = useRef(false);
  const goToConversations = useCallback(() => router.replace(getBackDestination('newConversation')), []);
  const goBack = useCallback(() => {
    if (isCreating) return false;
    if (step > 1) {
      setStep((current) => (current === 3 ? 2 : 1));
      setCreationError(null);
      return false;
    }
    goToConversations();
  }, [goToConversations, isCreating, step]);

  useDeterministicBack(goBack);

  const loadScenarios = useCallback(async () => {
    const currentRequestId = ++requestId.current;
    setStatus('loading');
    try {
      const result = await getConversationScenarios();
      if (currentRequestId !== requestId.current) return;
      setScenarios(result);
      setSelectedScenario((current) => (
        result.some((scenario) => scenario.id === current) ? current : null
      ));
      setStatus('success');
    } catch {
      if (currentRequestId === requestId.current) setStatus('error');
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void loadScenarios(); });
    void getProfile()
      .then((profile) => {
        if (!active) return;
        const recommendation = recommendedConversationDifficulty(profile.englishLevel);
        setRecommendedDifficulty(profile.englishLevel ? recommendation : null);
        if (!difficultyTouched.current) setSelectedDifficulty(recommendation);
      })
      .catch(() => undefined);

    return () => {
      active = false;
      requestId.current += 1;
    };
  }, [loadScenarios]);

  const scenarioOptions = useMemo(
    () => scenarios.map((scenario) => getConversationScenarioPresentation(scenario, API_URL)),
    [scenarios],
  );

  if (status === 'loading') return <PageLoading label="Carregando temas..." onBack={goBack} title="Nova conversa" />;

  const clearCreationError = () => setCreationError(null);
  const selectScenario = (scenario: string) => {
    setSelectedScenario(scenario);
    clearCreationError();
  };
  const selectDifficulty = (difficulty: ConversationDifficulty) => {
    difficultyTouched.current = true;
    setSelectedDifficulty(difficulty);
    clearCreationError();
  };
  const selectMode = (mode: ConversationMode) => {
    setSelectedMode(mode);
    clearCreationError();
  };
  const advance = () => {
    if (step === 1 && selectedScenario) setStep(2);
    else if (step === 2 && selectedDifficulty) setStep(3);
  };
  const startConversation = async () => {
    if (step !== 3 || !selectedScenario || !selectedDifficulty || !selectedMode || creationInFlight.current) return;
    creationInFlight.current = true;
    setIsCreating(true);
    setCreationError(null);
    try {
      const request = buildCreateConversationRequest(selectedScenario, selectedDifficulty, selectedMode);
      const conversation = await createConversation(request);
      router.replace({ pathname: '/conversations/[id]', params: { id: conversation.id, playOpening: conversation.interactionMode === 'VOICE' ? 'true' : 'false' } });
    } catch (error) {
      setCreationError(error instanceof ConversationCreateError
        ? getConversationCreateErrorMessage(error.status, error.kind)
        : getConversationCreateErrorMessage(null, 'network'));
    } finally {
      creationInFlight.current = false;
      setIsCreating(false);
    }
  };
  const canContinue = step === 1 ? selectedScenario !== null : step === 2 ? !!selectedDifficulty : !!selectedMode;

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.header}>
            <Pressable
              accessibilityLabel={step === 1 ? 'Voltar para conversas' : 'Voltar à etapa anterior'}
              accessibilityRole="button"
              hitSlop={8}
              onPress={goBack}
              style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            >
              <SymbolView accessible={false} name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={21} tintColor={colors.text} />
            </Pressable>
            <Text accessibilityRole="header" style={styles.heading}>Nova conversa</Text>
            <View style={styles.headerBalance} />
          </View>

          <View accessibilityLabel={`Etapa ${step} de 3`} style={styles.progress}>
            <Text style={styles.progressLabel}>Etapa {step} de 3</Text>
            <View style={styles.progressTrack}>
              {([1, 2, 3] as const).map((item) => (
                <View key={item} style={[styles.progressSegment, item <= step && styles.progressSegmentActive]} />
              ))}
            </View>
          </View>

          <ScrollView key={step} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionTitle}>{STEP_COPY[step].title}</Text>
            <Text style={styles.sectionDescription}>{STEP_COPY[step].description}</Text>

            {step === 1 && status === 'error' ? (
              <View accessibilityLiveRegion="polite" style={styles.stateCard}>
                <Text style={styles.stateTitle}>Não foi possível carregar os temas.</Text>
                <Text style={styles.stateDescription}>Verifique sua conexão e tente novamente.</Text>
                <Pressable accessibilityRole="button" onPress={() => void loadScenarios()} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
                  <Text style={styles.retryButtonText}>Tentar novamente</Text>
                </Pressable>
              </View>
            ) : null}

            {step === 1 && status === 'success' && scenarioOptions.length === 0 ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateTitle}>Nenhum tema disponível no momento.</Text>
                <Text style={styles.stateDescription}>Volte mais tarde para iniciar uma conversa.</Text>
              </View>
            ) : null}

            {step === 1 && status === 'success' && scenarioOptions.length > 0 ? (
              <View accessibilityRole="radiogroup" style={styles.scenarioGrid}>
                {scenarioOptions.map((scenario) => (
                  <ConversationScenarioCard key={scenario.id} onPress={() => selectScenario(scenario.id)} scenario={scenario} selected={selectedScenario === scenario.id} />
                ))}
              </View>
            ) : null}

            {step === 2 ? (
              <View accessibilityRole="radiogroup" style={styles.difficultyList}>
                {CONVERSATION_DIFFICULTY_OPTIONS.map((difficulty) => (
                  <ConversationDifficultyCard
                    icon={DIFFICULTY_ICONS[difficulty.value]}
                    key={difficulty.value}
                    onPress={() => selectDifficulty(difficulty.value)}
                    option={difficulty}
                    recommended={difficulty.value === recommendedDifficulty}
                    selected={difficulty.value === selectedDifficulty}
                  />
                ))}
              </View>
            ) : null}

            {step === 3 ? (
              <View accessibilityRole="radiogroup" style={styles.modeList}>
                {CONVERSATION_MODE_OPTIONS.map((mode) => (
                  <ConversationModeCard
                    icon={MODE_ICONS[mode.value]}
                    key={mode.value}
                    onPress={() => selectMode(mode.value)}
                    option={mode}
                    selected={selectedMode === mode.value}
                  />
                ))}
              </View>
            ) : null}
            {creationError ? <Text accessibilityLiveRegion="polite" style={styles.creationError}>{creationError}</Text> : null}
          </ScrollView>

          <View style={styles.actions}>
            {step > 1 ? (
              <Pressable accessibilityRole="button" disabled={isCreating} onPress={goBack} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                <Text style={styles.secondaryButtonText}>Voltar</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ busy: isCreating, disabled: !canContinue || isCreating }}
              disabled={!canContinue || isCreating}
              onPress={step === 3 ? () => void startConversation() : advance}
              style={({ pressed }) => [styles.primaryButton, (!canContinue || isCreating) && styles.primaryButtonDisabled, pressed && canContinue && !isCreating && styles.pressed]}
            >
              {isCreating ? <ActivityIndicator color="#ffffff" size="small" /> : null}
              <Text style={styles.primaryButtonText}>{isCreating ? 'Criando conversa...' : step === 3 ? 'Criar conversa' : 'Continuar'}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
      <StatusBar style="auto" />
    </View>
  );
}

const baseStyles = StyleSheet.create({
  screen: { backgroundColor: '#f8f9ff', flex: 1 },
  safeArea: { flex: 1 },
  content: { alignSelf: 'center', flex: 1, maxWidth: 478, paddingHorizontal: 20, paddingTop: 7, width: '100%' },
  header: { alignItems: 'center', flexDirection: 'row', minHeight: 48 },
  backButton: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e5e7f0', borderRadius: 20, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  heading: { color: '#171528', flex: 1, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  headerBalance: { width: 40 },
  progress: { marginBottom: 21, marginTop: 18 },
  progressLabel: { color: '#5b50f5', fontSize: 12, fontWeight: '700', marginBottom: 8 },
  progressTrack: { flexDirection: 'row', gap: 6 },
  progressSegment: { backgroundColor: '#e2e3ee', borderRadius: 3, flex: 1, height: 5 },
  progressSegmentActive: { backgroundColor: '#5b50f5' },
  scrollContent: { paddingBottom: 18 },
  sectionTitle: { color: '#171528', fontSize: 21, fontWeight: '700', lineHeight: 27 },
  sectionDescription: { color: '#74798d', fontSize: 13, lineHeight: 18, marginTop: 4 },
  stateCard: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e5e7f0', borderRadius: 17, borderWidth: 1, justifyContent: 'center', marginTop: 17, minHeight: 150, padding: 22 },
  stateTitle: { color: '#171528', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  stateDescription: { color: '#74798d', fontSize: 11.5, lineHeight: 17, marginTop: 5, textAlign: 'center' },
  retryButton: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 11, justifyContent: 'center', marginTop: 14, minHeight: 44, paddingHorizontal: 16 },
  retryButtonText: { color: '#ffffff', fontSize: 12.5, fontWeight: '700' },
  scenarioGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  difficultyList: { gap: 10, marginTop: 18 },
  modeList: { gap: 10, marginTop: 18 },
  actions: { flexDirection: 'row', gap: 10, paddingBottom: 12, paddingTop: 12 },
  secondaryButton: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#dcddea', borderRadius: 13, borderWidth: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: 25 },
  secondaryButtonText: { color: '#5147df', fontSize: 14, fontWeight: '700' },
  primaryButton: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 13, flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48 },
  primaryButtonDisabled: { backgroundColor: '#aaa5de' },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  creationError: { color: '#9f3f45', fontSize: 12, lineHeight: 17, marginTop: 14, textAlign: 'center' },
  pressed: { opacity: 0.72 },
});

import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { Alert, ActivityIndicator, FlatList, Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageLoading } from '../../../components/PageLoading';
import { useDeterministicBack } from '../../../hooks/use-deterministic-back';
import { getBackDestination } from '../../../navigation/back-destinations';
import { ConversationComposer } from '../components/ConversationComposer';
import { CollapsedConversationEvaluationBar, ConversationEvaluationCard } from '../components/ConversationEvaluationCard';
import { ConversationHeader } from '../components/ConversationHeader';
import { ConversationMessageBubble } from '../components/ConversationMessageBubble';
import { ConversationProgress } from '../components/ConversationProgress';
import { VoiceConversationControls } from '../components/VoiceConversationControls';
import { useConversationVoice } from '../audio/use-conversation-voice';
import { getConversationAudioErrorMessage, removeTemporaryAudio, transcribeConversationAudio, type RecordedAudio } from '../conversation-audio.service';
import { handleConversationBack } from '../conversation-evaluation-navigation';
import { isAtConversationEnd, shouldKeepConversationAtBottom, updateConversationPin } from '../conversation-scroll';
import { translateAssistantMessage } from '../conversation-translation.service';
import { appendDictationToDraft, canSendConversationMessage, getConversationEvaluationProgress, getInsufficientEvaluationMessage, getNewAssistantMessage, getUserCorrection, normalizeConversationMessage, visibleConversationMessages } from '../conversations.presentation';
import { completeConversation, ConversationRequestError, getConversation, sendConversationMessage } from '../conversations.service';
import type { ConversationDetail, ConversationEvaluation, ConversationMessage } from '../conversations.types';

type ConversationScreenProps = { conversationId: string | null; playOpening: boolean };
type LoadStatus = 'loading' | 'success' | 'error' | 'not-found';
type PendingAttempt = { message: string; knownMessageIds: Set<string>; source: 'text' | 'voice'; failed?: boolean };
let nextChatScrollInstance = 0;

export function ConversationScreen({ conversationId, playOpening }: ConversationScreenProps) {
  const styles = useThemedStyles(baseStyles);
  const goToConversations = useCallback(() => router.replace(getBackDestination('conversation')), []);
  const [status, setStatus] = useState<LoadStatus>(conversationId ? 'loading' : 'not-found');
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [draft, setDraft] = useState('');
  const [initialScrollReady, setInitialScrollReady] = useState(false);
  const [optimisticMessage, setOptimisticMessage] = useState<ConversationMessage | null>(null);
  const [optimisticKnownMessageIds, setOptimisticKnownMessageIds] = useState<ReadonlySet<string> | null>(null);
  const [optimisticDelivery, setOptimisticDelivery] = useState<'sending' | 'unconfirmed' | 'syncing'>('sending');
  const [isSending, setIsSending] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [completionNotice, setCompletionNotice] = useState<ConversationEvaluation | null>(null);
  const [requiresSync, setRequiresSync] = useState(false);
  const [completionRequiresSync, setCompletionRequiresSync] = useState(false);
  const [evaluationExpanded, setEvaluationExpanded] = useState(false);
  const closeEvaluation = useCallback(() => setEvaluationExpanded(false), []);
  const backFromConversation = useCallback(() => handleConversationBack(evaluationExpanded, closeEvaluation, goToConversations),
    [closeEvaluation, evaluationExpanded, goToConversations]);
  useDeterministicBack(backFromConversation);
  const [pendingAudio, setPendingAudio] = useState<RecordedAudio | null>(null);
  const [recognizedTranscript, setRecognizedTranscript] = useState<string | null>(null);
  const [translations, setTranslations] = useState<Record<string, { text: string | null; visible: boolean; loading: boolean; error: boolean }>>({});
  const [expandedCorrections, setExpandedCorrections] = useState<Record<string, boolean>>({});
  const requestId = useRef(0);
  const sendInFlight = useRef(false);
  const completeInFlight = useRef(false);
  const pendingAttempt = useRef<PendingAttempt | null>(null);
  const optimisticCounter = useRef(0);
  const listRef = useRef<FlatList>(null);
  const pinnedToBottom = useRef(true);
  const manualScrolling = useRef(false);
  const listHeight = useRef(0);
  const contentHeight = useRef(0);
  const initialScrollPending = useRef(true);
  const scrollFrame = useRef<number | null>(null);
  const revealFrame = useRef<number | null>(null);
  const correctedPositions = useRef(new Set<string>());
  const [scrollInstance] = useState(() => ++nextChatScrollInstance);
  const screenFocused = useRef(false);
  const scrollLogSequence = useRef(0);
  const conversationIdForLog = useRef(conversationId);
  const previousConversationId = useRef<string | null | undefined>(undefined);
  const lastOffsetY = useRef(0);
  const lastComposerHeight = useRef(0);
  const nextScrollRequest = useRef(0);
  const pendingScrollObservation = useRef<{ request: number; reason: string; at: number } | null>(null);
  const lastScrollSample = useRef<{ at: number; distance: number; pinned: boolean; dragging: boolean } | null>(null);
  const mounted = useRef(true);
  const openingPlayed = useRef(false);
  const voiceInFlight = useRef(false);
  const interactionMode = detail?.conversation.interactionMode ?? 'TEXT';

  const logScroll = useCallback((event: string, details: Record<string, unknown> = {}) => {
    if (typeof __DEV__ === 'undefined' || !__DEV__) return;
    console.info('[CHAT_SCROLL]', JSON.stringify({
      at: Date.now(), sequence: ++scrollLogSequence.current, instance: scrollInstance,
      conversationId: conversationIdForLog.current, isScreenFocused: screenFocused.current, event, ...details,
    }));
  }, [scrollInstance]);

  const scrollSnapshot = useCallback(() => ({
    offsetY: lastOffsetY.current,
    contentHeight: contentHeight.current,
    viewportHeight: listHeight.current,
    distanceFromBottom: Math.max(0, contentHeight.current - listHeight.current - lastOffsetY.current),
    pinnedToBottom: pinnedToBottom.current,
    isUserDragging: manualScrolling.current,
    initialScrollPending: initialScrollPending.current,
    pendingScrollRequest: pendingScrollObservation.current?.request ?? null,
  }), []);

  const setScrollPinned = useCallback((next: boolean, reason: string) => {
    const previous = pinnedToBottom.current;
    pinnedToBottom.current = next;
    if (previous !== next) logScroll('pin-change', { previous, next, reason, ...scrollSnapshot() });
  }, [logScroll, scrollSnapshot]);

  const cancelScheduledScroll = useCallback((reason: string) => {
    if ((scrollFrame.current !== null || revealFrame.current !== null) && reason !== 'superseded-by-automatic-offset-away-from-bottom') {
      logScroll('scroll-frame-cancel', { reason, scrollFramePending: scrollFrame.current !== null,
        revealFramePending: revealFrame.current !== null, ...scrollSnapshot() });
    }
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current);
    if (revealFrame.current !== null) cancelAnimationFrame(revealFrame.current);
    scrollFrame.current = null;
    revealFrame.current = null;
  }, [logScroll, scrollSnapshot]);

  const keepAtBottom = useCallback((reason: string) => {
    if (!shouldKeepConversationAtBottom(pinnedToBottom.current, manualScrolling.current, contentHeight.current, listHeight.current)) {
      logScroll('scroll-skip', { reason, ...scrollSnapshot() });
      return;
    }
    cancelScheduledScroll(`superseded-by-${reason}`);
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      if (!shouldKeepConversationAtBottom(pinnedToBottom.current, manualScrolling.current, contentHeight.current, listHeight.current)) {
        logScroll('scroll-frame-skip', { reason, ...scrollSnapshot() });
        return;
      }
      if (pendingScrollObservation.current) {
        logScroll('scroll-observation-superseded', { request: pendingScrollObservation.current.request,
          reason: pendingScrollObservation.current.reason, ...scrollSnapshot() });
      }
      const request = ++nextScrollRequest.current;
      const list = listRef.current;
      pendingScrollObservation.current = list ? { request, reason, at: Date.now() } : null;
      logScroll('scroll-request', { request, reason, listAttached: Boolean(list), ...scrollSnapshot() });
      list?.scrollToEnd({ animated: false });
      if (initialScrollPending.current) {
        revealFrame.current = requestAnimationFrame(() => {
          revealFrame.current = null;
          if (!initialScrollPending.current || !pinnedToBottom.current) return;
          initialScrollPending.current = false;
          logScroll('initial-scroll-ready', { request, ...scrollSnapshot() });
          setInitialScrollReady(true);
        });
      }
    });
  }, [cancelScheduledScroll, logScroll, scrollSnapshot]);

  const recordScrollPosition = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>, source: string) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    lastOffsetY.current = contentOffset.y;
    const distance = Math.max(0, contentSize.height - layoutMeasurement.height - contentOffset.y);
    const eventMetrics = { offsetY: contentOffset.y, contentHeight: contentSize.height,
      viewportHeight: layoutMeasurement.height, distanceFromBottom: distance,
      storedContentHeight: contentHeight.current, storedViewportHeight: listHeight.current,
      distanceUsingStoredMeasurements: Math.max(0, contentHeight.current - listHeight.current - contentOffset.y) };
    const observation = pendingScrollObservation.current;
    if (observation) {
      pendingScrollObservation.current = null;
      logScroll('scroll-observed', { request: observation.request, requestReason: observation.reason,
        elapsedMs: Date.now() - observation.at, source, ...eventMetrics, pinnedToBottom: pinnedToBottom.current,
        isUserDragging: manualScrolling.current });
    }
    if (manualScrolling.current) {
      setScrollPinned(updateConversationPin(pinnedToBottom.current, true, contentSize.height, layoutMeasurement.height, contentOffset.y), `manual-${source}`);
      correctedPositions.current.clear();
    } else if (!pinnedToBottom.current || isAtConversationEnd(contentSize.height, layoutMeasurement.height, contentOffset.y)) {
      correctedPositions.current.clear();
    } else {
      const position = `${contentSize.height}:${layoutMeasurement.height}:${contentOffset.y}`;
      if (!correctedPositions.current.has(position)) {
        correctedPositions.current.add(position);
        keepAtBottom('automatic-offset-away-from-bottom');
      }
    }
    const now = Date.now();
    const previousSample = lastScrollSample.current;
    if (source !== 'onScroll' || observation || !previousSample ||
      previousSample.pinned !== pinnedToBottom.current || previousSample.dragging !== manualScrolling.current ||
      now - previousSample.at >= 400 || Math.abs(distance - previousSample.distance) >= 100) {
      logScroll(source, { ...eventMetrics, pinnedToBottom: pinnedToBottom.current, isUserDragging: manualScrolling.current });
      lastScrollSample.current = { at: now, distance, pinned: pinnedToBottom.current, dragging: manualScrolling.current };
    }
  }, [keepAtBottom, logScroll, setScrollPinned]);

  useEffect(() => { conversationIdForLog.current = conversationId; }, [conversationId]);

  useEffect(() => {
    mounted.current = true;
    logScroll('screen-mount', { ...scrollSnapshot() });
    return () => {
      logScroll('screen-unmount', { pendingRequest: pendingScrollObservation.current?.request ?? null, ...scrollSnapshot() });
      mounted.current = false;
      requestId.current += 1;
      cancelScheduledScroll('screen-unmount');
    };
  }, [cancelScheduledScroll, logScroll, scrollSnapshot]);

  useFocusEffect(useCallback(() => {
    screenFocused.current = true;
    logScroll('screen-focus', { ...scrollSnapshot() });
    return () => { screenFocused.current = false; logScroll('screen-blur', { ...scrollSnapshot() }); };
  }, [logScroll, scrollSnapshot]));

  useEffect(() => {
    logScroll('conversation-id', { previous: previousConversationId.current ?? null, next: conversationId,
      ...scrollSnapshot() });
    previousConversationId.current = conversationId;
  }, [conversationId, logScroll, scrollSnapshot]);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => logScroll('keyboard-show', {
      keyboardHeight: event.endCoordinates.height, keyboardScreenY: event.endCoordinates.screenY, ...scrollSnapshot(),
    }));
    const hide = Keyboard.addListener('keyboardDidHide', (event) => logScroll('keyboard-hide', {
      keyboardHeight: event.endCoordinates.height, keyboardScreenY: event.endCoordinates.screenY, ...scrollSnapshot(),
    }));
    const willShow = Platform.OS === 'ios' ? Keyboard.addListener('keyboardWillShow', (event) => logScroll('keyboard-will-show', {
      keyboardHeight: event.endCoordinates.height, ...scrollSnapshot(),
    })) : null;
    const willHide = Platform.OS === 'ios' ? Keyboard.addListener('keyboardWillHide', (event) => logScroll('keyboard-will-hide', {
      keyboardHeight: event.endCoordinates.height, ...scrollSnapshot(),
    })) : null;
    return () => { show.remove(); hide.remove(); willShow?.remove(); willHide?.remove(); };
  }, [logScroll, scrollSnapshot]);

  const voice = useConversationVoice({
    conversationId,
    enabled: Boolean(conversationId && detail),
    onRecordingReady: async (audio) => { setPendingAudio(audio); },
  });

  const applyDetail = useCallback((next: ConversationDetail) => {
    logScroll('detail-applied', { messageCount: next.messages.length, ...scrollSnapshot() });
    const pending = pendingAttempt.current;
    if (pending) {
      const persisted = next.messages.some((message) => message.role === 'USER' && message.content === pending.message && !pending.knownMessageIds.has(message.id));
      const answered = next.messages.some((message) => message.role === 'ASSISTANT' && !pending.knownMessageIds.has(message.id));
      if (pending.source === 'text') {
        setOptimisticMessage(null);
        setOptimisticKnownMessageIds(null);
        if (!persisted) setDraft(pending.message);
      } else if (persisted) setDraft('');
      pendingAttempt.current = null;
      setSendError(pending.source === 'text'
        ? !persisted ? 'Mensagem não encontrada no histórico. Revise antes de reenviar.'
          : pending.failed && !answered ? 'Sua mensagem foi salva, mas a resposta da IA não chegou.' : null
        : null);
    } else {
      setSendError(null);
    }
    setDetail(next);
    setStatus('success');
    setRequiresSync(false);
    setCompletionRequiresSync(false);
    setCompletionError(null);
  }, [logScroll, scrollSnapshot]);

  const loadConversation = useCallback(async (showLoading = true) => {
    if (!conversationId) { logScroll('load-no-conversation-id'); setStatus('not-found'); return; }
    const currentRequestId = ++requestId.current;
    logScroll('load-start', { requestId: currentRequestId, showLoading, ...scrollSnapshot() });
    if (showLoading) {
      cancelScheduledScroll('initial-load');
      initialScrollPending.current = true;
      setScrollPinned(true, 'initial-load');
      manualScrolling.current = false;
      contentHeight.current = 0;
      listHeight.current = 0;
      lastOffsetY.current = 0;
      lastScrollSample.current = null;
      correctedPositions.current.clear();
      if (pendingScrollObservation.current) {
        logScroll('scroll-observation-superseded', { request: pendingScrollObservation.current.request,
          reason: 'initial-load' });
        pendingScrollObservation.current = null;
      }
      logScroll('initial-scroll-pending', { requestId: currentRequestId, ...scrollSnapshot() });
      setInitialScrollReady(false);
      setStatus('loading');
    }
    try {
      const next = await getConversation(conversationId);
      if (!mounted.current || currentRequestId !== requestId.current) return;
      logScroll('load-success', { requestId: currentRequestId, messageCount: next.messages.length, ...scrollSnapshot() });
      applyDetail(next);
    } catch (error) {
      if (!mounted.current || currentRequestId !== requestId.current) return;
      logScroll('load-error', { requestId: currentRequestId, errorName: error instanceof Error ? error.name : typeof error,
        status: error instanceof ConversationRequestError ? error.status : null });
      if (error instanceof ConversationRequestError && error.status === 404) setStatus('not-found');
      else if (!showLoading) {
        setRequiresSync(true);
        setCompletionRequiresSync(true);
        setSendError('Não foi possível atualizar a conversa. Verifique sua conexão e tente novamente.');
      } else setStatus('error');
    }
  }, [applyDetail, cancelScheduledScroll, conversationId, logScroll, scrollSnapshot, setScrollPinned]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void loadConversation(); });
    return () => { active = false; };
  }, [loadConversation]);

  const sendMessage = async () => {
    if (!conversationId || !detail || !canSendConversationMessage(detail.conversation.endedAt) || requiresSync || sendInFlight.current || isCompleting || voice.phase === 'recording' || voice.phase === 'transcribing') return;
    let message: string | null;
    try { message = normalizeConversationMessage(draft); } catch { setSendError('A mensagem deve ter no máximo 5000 caracteres.'); return; }
    if (!message) { setSendError('Digite uma mensagem antes de enviar.'); return; }
    const knownMessageIds = new Set(detail.messages.map(({ id }) => id));
    pendingAttempt.current = { knownMessageIds, message, source: 'text' };
    setOptimisticKnownMessageIds(knownMessageIds);
    sendInFlight.current = true;
    setOptimisticMessage({ id: `local-${++optimisticCounter.current}`, role: 'USER', content: message, correctedText: null, createdAt: new Date().toISOString() });
    setOptimisticDelivery('sending');
    setDraft('');
    setIsSending(true);
    setSendError(null);
    setCompletionNotice(null);
    setScrollPinned(true, 'optimistic-send');
    let postCompleted = false;
    try {
      await sendConversationMessage(conversationId, message);
      postCompleted = true;
      const refreshed = await getConversation(conversationId);
      if (!mounted.current) return;
      applyDetail(refreshed);
    } catch (error) {
      if (!mounted.current) return;
      if (pendingAttempt.current?.source === 'text') pendingAttempt.current.failed = true;
      setOptimisticDelivery(postCompleted ? 'syncing' : 'unconfirmed');
      setRequiresSync(true);
      setSendError(postCompleted ? 'A resposta foi salva, mas não foi possível atualizar o histórico. Atualize a conversa.' : sendFailureMessage(error));
    } finally {
      sendInFlight.current = false;
      if (mounted.current) setIsSending(false);
    }
  };

  const processVoiceRecording = useCallback(async (audio: RecordedAudio) => {
    if (!conversationId || !detail || !canSendConversationMessage(detail.conversation.endedAt) ||
      requiresSync || sendInFlight.current || isCompleting || voiceInFlight.current) { removeTemporaryAudio(audio.uri); return; }
    voiceInFlight.current = true;
    setSendError(null);
    setCompletionNotice(null);
    setRecognizedTranscript(null);
    voice.setPhase('transcribing');
    let messagePostStarted = false;
    let messagePostCompleted = false;
    try {
      const transcription = await transcribeConversationAudio(audio);
      if (!mounted.current) return;
      const message = normalizeConversationMessage(transcription.text);
      if (!message) {
        voice.reportError('Não consegui identificar sua fala. Tente novamente.');
        return;
      }
      setRecognizedTranscript(message);
      const knownMessageIds = new Set(detail.messages.map(({ id }) => id));
      pendingAttempt.current = { knownMessageIds, message, source: 'voice' };
      sendInFlight.current = true;
      setIsSending(true);
      voice.setPhase('sending');
      messagePostStarted = true;
      await sendConversationMessage(conversationId, message);
      messagePostCompleted = true;
      voice.setPhase('waitingForAssistant');
      const refreshed = await getConversation(conversationId);
      if (!mounted.current) return;
      applyDetail(refreshed);
      const newAssistantMessage = getNewAssistantMessage(knownMessageIds, refreshed.messages);
      if (newAssistantMessage) await voice.playAssistantMessage(newAssistantMessage.content, newAssistantMessage.id);
      else voice.setPhase('idle');
    } catch (error) {
      if (!mounted.current) return;
      if (messagePostStarted) setRequiresSync(true);
      voice.reportError(error instanceof Error && error.message === 'message-too-long'
        ? 'A transcrição excede o limite permitido para uma mensagem.'
        : error instanceof ConversationRequestError
          ? messagePostCompleted
            ? 'A resposta foi salva, mas não foi possível atualizar o histórico. Atualize a conversa.'
            : 'Não foi possível confirmar o envio por voz. Atualize a conversa antes de tentar novamente.'
          : getConversationAudioErrorMessage(error));
    } finally {
      removeTemporaryAudio(audio.uri);
      voiceInFlight.current = false;
      sendInFlight.current = false;
      if (mounted.current) setIsSending(false);
    }
  }, [applyDetail, conversationId, detail, isCompleting, requiresSync, voice]);

  const processDictation = useCallback(async (audio: RecordedAudio) => {
    voice.setPhase('transcribing');
    try {
      const result = await transcribeConversationAudio(audio);
      if (!mounted.current) return;
      const nextDraft = appendDictationToDraft(draft, result.text);
      setDraft(nextDraft);
      voice.setPhase('idle');
    } catch (error) {
      if (mounted.current) voice.reportError(error instanceof Error && error.message === 'empty-transcription'
        ? 'Não consegui identificar sua fala. Tente novamente.'
        : error instanceof Error && error.message === 'message-too-long'
          ? 'A transcrição excede o limite permitido para a mensagem.'
          : getConversationAudioErrorMessage(error));
    } finally {
      removeTemporaryAudio(audio.uri);
    }
  }, [draft, voice]);

  useEffect(() => {
    if (!pendingAudio) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setPendingAudio(null);
      void (interactionMode === 'VOICE' ? processVoiceRecording(pendingAudio) : processDictation(pendingAudio));
    });
    return () => { active = false; };
  }, [interactionMode, pendingAudio, processVoiceRecording, processDictation]);

  useEffect(() => {
    if (interactionMode !== 'VOICE' || !playOpening || openingPlayed.current || !detail || detail.conversation.endedAt !== null) return;
    const opening = detail.messages.find((message) => message.role === 'ASSISTANT');
    if (!opening) return;
    openingPlayed.current = true;
    void voice.playAssistantMessage(opening.content, opening.id);
  }, [detail, interactionMode, playOpening, voice]);

  const toggleTranslation = async (message: ConversationMessage) => {
    const current = translations[message.id];
    if (current?.loading) return;
    if (current?.text) {
      setTranslations((all) => ({ ...all, [message.id]: { ...all[message.id], visible: !all[message.id].visible } }));
      return;
    }
    setTranslations((all) => ({ ...all, [message.id]: { text: null, visible: false, loading: true, error: false } }));
    try {
      const text = await translateAssistantMessage(message.content);
      if (mounted.current) setTranslations((all) => ({ ...all, [message.id]: { text, visible: true, loading: false, error: false } }));
    } catch {
      if (mounted.current) setTranslations((all) => ({ ...all, [message.id]: { text: null, visible: false, loading: false, error: true } }));
    }
  };

  const toggleSpeech = (message: ConversationMessage) => {
    if (voice.phase === 'recording' || voice.phase === 'transcribing' || voice.phase === 'sending' || voice.phase === 'waitingForAssistant') return;
    if (voice.speechMessageId === message.id && voice.speechPlaying) voice.stopPlayback();
    else void voice.playAssistantMessage(message.content, message.id);
  };

  const toggleCorrection = useCallback((messageId: string) => {
    setExpandedCorrections((current) => ({ ...current, [messageId]: !current[messageId] }));
  }, []);

  const performCompletion = async () => {
    if (!conversationId || !detail || completeInFlight.current || isSending) return;
    completeInFlight.current = true;
    setIsCompleting(true);
    setCompletionError(null);
    setCompletionNotice(null);
    let postCompleted = false;
    try {
      const evaluation = await completeConversation(conversationId);
      postCompleted = true;
      const refreshed = await getConversation(conversationId);
      if (!mounted.current) return;
      applyDetail(refreshed);
      if (evaluation.status === 'INSUFFICIENT') setCompletionNotice(evaluation);
      else setEvaluationExpanded(true);
    } catch (error) {
      if (!mounted.current) return;
      const requiresReconciliation = !(error instanceof ConversationRequestError && error.kind === 'http');
      setCompletionRequiresSync(requiresReconciliation);
      setCompletionError(postCompleted
        ? 'A conclusão foi confirmada, mas não foi possível atualizar a conversa. Atualize para conferir o resultado.'
        : completionFailureMessage(error));
    } finally {
      completeInFlight.current = false;
      if (mounted.current) setIsCompleting(false);
    }
  };

  const requestCompletion = () => {
    if (!detail || isCompleting || isSending || completionRequiresSync || voice.phase === 'recording' || voice.phase === 'transcribing' || !getConversationEvaluationProgress(detail.messages).ready) return;
    Alert.alert(
      'Finalizar conversa?',
      'A conversa será encerrada e não poderá receber novas mensagens. A avaliação será gerada agora.',
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Finalizar', style: 'destructive', onPress: () => void performCompletion() }],
    );
  };

  if (status === 'loading') return <PageLoading label="Carregando conversa..." onBack={goToConversations} title="Conversa" />;
  if (status === 'not-found') return <ConversationState action="Voltar para Conversas" icon="missing" onAction={goToConversations} title="Esta conversa não está disponível." />;
  if (status === 'error' || !detail) return <ConversationState action="Tentar novamente" icon="error" onAction={() => void loadConversation()} title="Não foi possível carregar a conversa." />;

  const { conversation, evaluation } = detail;
  const messages = visibleConversationMessages(detail.messages, optimisticMessage, optimisticKnownMessageIds);
  const assistantName = conversation.assistantDisplayName || 'Assistente';
  const ended = conversation.endedAt !== null;
  const syncRequired = requiresSync || completionRequiresSync;

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          onLayout={(event) => logScroll('keyboard-avoiding-view-layout', { height: event.nativeEvent.layout.height, ...scrollSnapshot() })}
          style={styles.keyboardView}>
          <ConversationHeader conversation={conversation} onBack={backFromConversation}
            backLabel={evaluationExpanded ? 'Voltar para conversa' : 'Voltar para conversas'} />
          {!ended ? <ConversationProgress isCompleting={isCompleting} disabled={syncRequired || isSending || voice.phase === 'recording' || voice.phase === 'transcribing'} messages={detail.messages} onComplete={requestCompletion} /> : null}
          {completionNotice ? <CompletionNotice evaluation={completionNotice} /> : null}
          <View onLayout={(event) => logScroll('chat-area-layout', { height: event.nativeEvent.layout.height, ...scrollSnapshot() })} style={styles.chatArea}>
            {ended && evaluation && !evaluationExpanded ? <CollapsedConversationEvaluationBar onExpand={() => setEvaluationExpanded(true)} /> : null}
            <FlatList
              contentContainerStyle={styles.messagesContent}
              data={messages}
              keyExtractor={(message) => message.id}
              keyboardDismissMode="none"
              keyboardShouldPersistTaps="always"
              onContentSizeChange={(_, height) => {
                const previousHeight = contentHeight.current;
                contentHeight.current = height;
                logScroll('content-size-change', { previousHeight, reportedContentHeight: height, ...scrollSnapshot() });
                correctedPositions.current.clear();
                keepAtBottom('content-size-change');
              }}
              onLayout={(event) => {
                const previousHeight = listHeight.current;
                listHeight.current = event.nativeEvent.layout.height;
                logScroll('flatlist-layout', { previousHeight, reportedViewportHeight: listHeight.current, ...scrollSnapshot() });
                correctedPositions.current.clear();
                keepAtBottom('flatlist-layout');
              }}
              onScroll={(event) => recordScrollPosition(event, 'onScroll')}
              onScrollBeginDrag={(event) => {
                manualScrolling.current = true;
                logScroll('onScrollBeginDrag', { eventOffsetY: event.nativeEvent.contentOffset.y, ...scrollSnapshot() });
                cancelScheduledScroll('onScrollBeginDrag');
              }}
              onScrollEndDrag={(event) => {
                recordScrollPosition(event, 'onScrollEndDrag');
                manualScrolling.current = false;
                logScroll('drag-ended', { ...scrollSnapshot() });
                keepAtBottom('onScrollEndDrag');
              }}
              onMomentumScrollBegin={(event) => {
                manualScrolling.current = true;
                logScroll('onMomentumScrollBegin', { eventOffsetY: event.nativeEvent.contentOffset.y, ...scrollSnapshot() });
                cancelScheduledScroll('onMomentumScrollBegin');
              }}
              onMomentumScrollEnd={(event) => {
                recordScrollPosition(event, 'onMomentumScrollEnd');
                manualScrolling.current = false;
                logScroll('momentum-ended', { ...scrollSnapshot() });
                keepAtBottom('onMomentumScrollEnd');
              }}
              ref={listRef}
              renderItem={({ item, index }) => <ConversationMessageBubble assistantName={assistantName} message={item}
                deliveryState={item.id === optimisticMessage?.id ? optimisticDelivery : undefined}
                correction={getUserCorrection(messages, index)}
                correctionExpanded={Boolean(expandedCorrections[item.id])}
                translation={translations[item.id]?.visible ? translations[item.id].text ?? undefined : undefined}
                translationLoading={translations[item.id]?.loading}
                translationError={translations[item.id]?.error}
                speechLoading={voice.speechLoading && voice.speechMessageId === item.id}
                speaking={voice.speechPlaying && voice.speechMessageId === item.id}
                speechError={voice.speechErrorMessageId === item.id}
                speechDisabled={voice.phase === 'recording' || voice.phase === 'transcribing' || voice.phase === 'sending' || voice.phase === 'waitingForAssistant' || isCompleting}
                onToggleCorrection={() => toggleCorrection(item.id)}
                onTranslate={() => void toggleTranslation(item)} onSpeech={() => toggleSpeech(item)} />}
              showsVerticalScrollIndicator={false}
              scrollEnabled={initialScrollReady}
              scrollEventThrottle={16}
              style={[styles.messages, !initialScrollReady && styles.messagesBeforeInitialScroll]}
            />
            {isSending && interactionMode === 'TEXT' ? <View accessibilityLiveRegion="polite" style={styles.responding}><ActivityIndicator color="#5b50f5" size="small" /><Text style={styles.respondingText}>{assistantName} está respondendo...</Text></View> : null}
            {sendError ? <InlineError message={sendError} onSync={requiresSync ? () => void loadConversation(false) : undefined} /> : null}
            {completionError ? <InlineError message={completionError} onSync={completionRequiresSync ? () => void loadConversation(false) : undefined} /> : null}
            {ended ? <View style={styles.endedBanner}><SymbolView accessible={false} name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={20} tintColor="#3d805c" /><Text style={styles.endedText}>Conversa concluída. O histórico permanece disponível.</Text></View> : interactionMode === 'VOICE' ? (
              <VoiceConversationControls
                assistantName={assistantName}
                disabled={syncRequired || isCompleting || isSending}
                error={voice.error}
                onCancelRecording={() => void voice.cancelRecording()}
                onClearError={voice.clearError}
                onLayout={() => { logScroll('voice-controls-layout', { ...scrollSnapshot() }); keepAtBottom('voice-controls-layout'); }}
                onStartRecording={() => void voice.startRecording()}
                onStopPlayback={voice.stopPlayback}
                onStopRecording={() => void voice.stopRecording()}
                phase={voice.phase}
                transcript={recognizedTranscript}
              />
            ) : (
              <ConversationComposer disabled={syncRequired || isCompleting} onChangeText={(value) => { setDraft(value); if (!requiresSync) setSendError(null); }}
                onLayout={(height) => {
                  const previousHeight = lastComposerHeight.current;
                  lastComposerHeight.current = height;
                  logScroll('composer-layout', { previousHeight, composerHeight: height, ...scrollSnapshot() });
                  keepAtBottom('composer-layout');
                }}
                onInputFocus={() => logScroll('input-focus', { ...scrollSnapshot() })}
                onInputBlur={() => logScroll('input-blur', { ...scrollSnapshot() })}
                onSend={() => void sendMessage()} sending={isSending} value={draft}
                dictationPhase={voice.phase} dictationError={voice.error} onCancelDictation={() => void voice.cancelRecording()} onStartDictation={() => void voice.startRecording()}
                onStopDictation={() => void voice.stopRecording()} onClearDictationError={voice.clearError} />
            )}
            {ended && evaluation && evaluationExpanded ? (
              <ConversationEvaluationCard
                evaluation={evaluation}
                onBackToConversations={goToConversations}
                onMinimize={closeEvaluation}
                onNewConversation={() => router.push('/conversations/new')}
              />
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <StatusBar style="auto" />
    </View>
  );
}

function CompletionNotice({ evaluation }: { evaluation: ConversationEvaluation }) {
  const styles = useThemedStyles(baseStyles);
  return <View accessibilityLiveRegion="polite" style={styles.completionNotice}><Text style={styles.completionNoticeTitle}>Avaliação ainda não disponível</Text><Text style={styles.completionNoticeText}>{getInsufficientEvaluationMessage(evaluation)}</Text></View>;
}

function InlineError({ message, onSync }: { message: string; onSync?: () => void }) {
  const styles = useThemedStyles(baseStyles);
  return <View accessibilityLiveRegion="polite" style={styles.sendError}><Text style={styles.sendErrorText}>{message}</Text>{onSync ? <Pressable accessibilityRole="button" onPress={onSync} style={({ pressed }) => pressed && styles.pressed}><Text style={styles.syncAction}>Atualizar conversa</Text></Pressable> : null}</View>;
}

function sendFailureMessage(error: unknown): string {
  if (!(error instanceof ConversationRequestError)) return 'Não foi possível confirmar o envio. Atualize a conversa antes de tentar novamente.';
  if (error.status === 404) return 'Esta conversa não está mais disponível. Atualize para confirmar.';
  if (error.status === 400) return 'Não foi possível enviar. A conversa pode ter sido concluída. Atualize para confirmar.';
  if (error.status === 429) return 'Muitas mensagens foram enviadas. Aguarde um pouco e atualize a conversa.';
  if (error.status === 503) return 'A IA está temporariamente indisponível. Atualize a conversa antes de tentar novamente.';
  return 'Não foi possível confirmar o envio. Atualize a conversa antes de tentar novamente.';
}

function completionFailureMessage(error: unknown): string {
  if (!(error instanceof ConversationRequestError)) return 'Não foi possível confirmar a conclusão. Atualize a conversa antes de tentar novamente.';
  if (error.status === 404) return 'Esta conversa não está mais disponível. Atualize para confirmar.';
  if (error.status === 400) return 'A conversa não pode ser finalizada agora. Aguarde a resposta atual e atualize a conversa.';
  if (error.status === 429) return 'Muitas solicitações no momento. Aguarde um pouco e atualize a conversa.';
  if (error.status === 503) return 'A avaliação está temporariamente indisponível. Seu histórico foi preservado; atualize antes de tentar novamente.';
  return 'Não foi possível confirmar a conclusão. Atualize a conversa antes de tentar novamente.';
}

type ConversationStateProps = { title: string; icon: 'progress' | 'missing' | 'error'; action?: string; onAction?: () => void };
function ConversationState({ title, icon, action, onAction }: ConversationStateProps) {
  const styles = useThemedStyles(baseStyles);
  return <View style={styles.screen}><SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.stateSafeArea}>{icon === 'progress' ? <ActivityIndicator color="#5b50f5" size="large" /> : <SymbolView accessible={false} name={icon === 'missing' ? { ios: 'bubble.left', android: 'chat_bubble_outline', web: 'chat_bubble_outline' } : { ios: 'exclamationmark.bubble.fill', android: 'error', web: 'error' }} size={38} tintColor="#5b50f5" />}<Text accessibilityRole="header" style={styles.stateTitle}>{title}</Text>{action && onAction ? <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}><Text style={styles.stateButtonText}>{action}</Text></Pressable> : null}</SafeAreaView><StatusBar style="auto" /></View>;
}

const baseStyles = StyleSheet.create({
  screen: { backgroundColor: '#f8f9ff', flex: 1 }, safeArea: { flex: 1 }, keyboardView: { flex: 1 }, chatArea: { flex: 1 }, messages: { flex: 1 },
  messagesBeforeInitialScroll: { opacity: 0 },
  messagesContent: { flexGrow: 1, justifyContent: 'flex-end', paddingBottom: 12, paddingHorizontal: 16, paddingTop: 14 },
  responding: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 34, paddingHorizontal: 18 }, respondingText: { color: '#686e82', fontSize: 11.5, fontStyle: 'italic' },
  sendError: { backgroundColor: '#fff1f1', borderTopColor: '#f0cdcf', borderTopWidth: 1, paddingHorizontal: 15, paddingVertical: 9 }, sendErrorText: { color: '#8f3c42', fontSize: 11, lineHeight: 16 }, syncAction: { color: '#6b42d8', fontSize: 11.5, fontWeight: '700', marginTop: 6 },
  completionNotice: { backgroundColor: '#fff8e7', borderBottomColor: '#f1deb0', borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 9 }, completionNoticeTitle: { color: '#805c14', fontSize: 11.5, fontWeight: '800' }, completionNoticeText: { color: '#75623a', fontSize: 10.5, lineHeight: 15, marginTop: 3 },
  endedBanner: { alignItems: 'center', backgroundColor: '#eef8f2', borderTopColor: '#cfe8d9', borderTopWidth: 1, flexDirection: 'row', gap: 8, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10 }, endedText: { color: '#3d6d50', flex: 1, fontSize: 11.5, lineHeight: 16 },
  stateSafeArea: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 }, stateTitle: { color: '#262337', fontSize: 17, fontWeight: '700', marginTop: 13, textAlign: 'center' }, stateButton: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 11, justifyContent: 'center', marginTop: 17, minHeight: 44, paddingHorizontal: 18 }, stateButtonText: { color: '#ffffff', fontSize: 12.5, fontWeight: '700' }, pressed: { opacity: 0.72 },
});

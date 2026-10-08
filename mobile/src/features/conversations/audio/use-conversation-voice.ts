import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { getConversationAudioErrorMessage, removeTemporaryAudio, synthesizeConversationSpeech, type RecordedAudio } from '../conversation-audio.service';

export type VoiceInteractionPhase =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'sending'
  | 'waitingForAssistant'
  | 'speaking'
  | 'error';

type UseConversationVoiceOptions = {
  conversationId: string | null;
  enabled: boolean;
  onRecordingReady: (audio: RecordedAudio) => Promise<void>;
};

export function useConversationVoice({ conversationId, enabled, onRecordingReady }: UseConversationVoiceOptions) {
  const [phase, setPhase] = useState<VoiceInteractionPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [speechMessageId, setSpeechMessageId] = useState<string | null>(null);
  const [speechLoading, setSpeechLoading] = useState(false);
  const [speechErrorMessageId, setSpeechErrorMessageId] = useState<string | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const playbackFile = useRef<File | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const recordingGeneration = useRef(0);
  const recordingActive = useRef(false);
  const recorderOperation = useRef(false);
  const speechMessageIdRef = useRef<string | null>(null);
  const previousDidJustFinish = useRef(false);

  const restorePlaybackAudioMode = useCallback(async () => {
    await setAudioModeAsync({
      allowsRecording: false,
      interruptionMode: 'doNotMix',
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
    });
  }, []);

  const clearPlaybackFile = useCallback(() => {
    try { playbackFile.current?.delete(); } catch { /* Cache cleanup is best effort. */ }
    playbackFile.current = null;
  }, []);

  const stopPlayback = useCallback(() => {
    generation.current += 1;
    if (mounted.current) {
      player.pause();
      speechMessageIdRef.current = null;
      setSpeechMessageId(null);
      setSpeechLoading(false);
      setPhase('idle');
    }
    clearPlaybackFile();
  }, [clearPlaybackFile, player]);

  useEffect(() => {
    const didJustFinish = playerStatus.didJustFinish;
    const didFinishNow = didJustFinish && !previousDidJustFinish.current;
    previousDidJustFinish.current = didJustFinish;
    if (phase !== 'speaking' || speechLoading) return;
    if (playerStatus.error) {
      clearPlaybackFile();
      setSpeechErrorMessageId(speechMessageIdRef.current);
      speechMessageIdRef.current = null;
      setSpeechMessageId(null);
      setSpeechLoading(false);
      setError('Não foi possível reproduzir o áudio.');
      setPhase('error');
      return;
    }
    // didJustFinish can remain true for one render after replacing a source.
    // Only react to its rising edge; otherwise a replay can be stopped before
    // the newly synthesized audio starts.
    if (didFinishNow) {
      clearPlaybackFile();
      speechMessageIdRef.current = null;
      setSpeechMessageId(null);
      setSpeechLoading(false);
      setPhase('idle');
    }
  }, [clearPlaybackFile, phase, playerStatus.didJustFinish, playerStatus.error, speechLoading]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      recordingGeneration.current += 1;
      recordingActive.current = false;
      void (async () => {
        try {
          if (!recorderOperation.current) {
            if (recorder.isRecording) await recorder.stop();
            if (recorder.uri) removeTemporaryAudio(recorder.uri);
          }
          await restorePlaybackAudioMode();
        } catch {
          // The recorder and cache are transient resources; cleanup is best effort.
        }
      })();
      // useAudioPlayer owns and releases its shared player during unmount. Calling a
      // player method from this cleanup can race that release on Android.
      clearPlaybackFile();
    };
  }, [clearPlaybackFile, recorder, restorePlaybackAudioMode]);

  const startRecording = useCallback(async () => {
    if (!enabled || !mounted.current || recorderOperation.current || recorder.isRecording ||
      (phase !== 'idle' && phase !== 'speaking')) return;
    recorderOperation.current = true;
    recordingGeneration.current += 1;
    if (phase === 'speaking') stopPlayback();
    setError(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!mounted.current) return;
      if (!permission.granted) {
        if (mounted.current) {
          setError('Permita o uso do microfone para praticar por voz.');
          setPhase('error');
        }
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (!mounted.current) { await restorePlaybackAudioMode(); return; }
      await recorder.prepareToRecordAsync();
      if (!mounted.current) { await restorePlaybackAudioMode(); return; }
      recorder.record();
      recordingActive.current = true;
      if (mounted.current) setPhase('recording');
    } catch {
      try { await restorePlaybackAudioMode(); } catch { /* Audio session cleanup is best effort. */ }
      if (mounted.current) {
        setError('Não foi possível iniciar a gravação. Tente novamente.');
        setPhase('error');
      }
    } finally {
      if (!mounted.current) {
        try { if (recorder.isRecording) await recorder.stop(); } catch { /* Cleanup is best effort. */ }
        if (recorder.uri) removeTemporaryAudio(recorder.uri);
      }
      recorderOperation.current = false;
    }
  }, [enabled, phase, recorder, restorePlaybackAudioMode, stopPlayback]);

  const stopRecording = useCallback(async () => {
    if (phase !== 'recording' || !recordingActive.current || recorderOperation.current) return;
    recorderOperation.current = true;
    const currentRecording = recordingGeneration.current;
    let recordedUri: string | null = null;
    try {
      if (recorder.isRecording) await recorder.stop();
      const uri = recorder.uri;
      recordedUri = uri;
      await restorePlaybackAudioMode();
      if (!mounted.current || currentRecording !== recordingGeneration.current) {
        recordingActive.current = false;
        if (uri) removeTemporaryAudio(uri);
        return;
      }
      if (!uri) throw new Error('missing-recording');
      const recordingFile = new File(uri);
      if (!recordingFile.exists || recordingFile.size <= 0) throw new Error('empty-recording');
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.info('[STT] recording-ready', { contentType: 'audio/mp4', size: recordingFile.size });
      }
      recordingActive.current = false;
      setPhase('transcribing');
      await onRecordingReady({ mimeType: 'audio/mp4', name: 'recording.m4a', uri });
    } catch {
      if (recordedUri || recorder.uri) removeTemporaryAudio(recordedUri ?? recorder.uri!);
      try { await restorePlaybackAudioMode(); } catch { /* Cleanup is best effort. */ }
      if (mounted.current && currentRecording === recordingGeneration.current) {
        recordingActive.current = false;
        setError('Não foi possível processar a gravação. Tente novamente.');
        setPhase('error');
      }
    } finally {
      if (currentRecording !== recordingGeneration.current && recorder.uri) removeTemporaryAudio(recorder.uri);
      recorderOperation.current = false;
    }
  }, [onRecordingReady, phase, recorder, restorePlaybackAudioMode]);

  const cancelRecording = useCallback(async () => {
    if (phase !== 'recording' || !recordingActive.current || !mounted.current) return;
    recordingActive.current = false;
    recordingGeneration.current += 1;
    setError(null);
    setPhase('idle');
    // A concurrent finish owns recorder.stop(); its generation check discards the file.
    if (recorderOperation.current) return;
    recorderOperation.current = true;
    try {
      await recorder.stop();
    } catch {
      // Cancellation still discards any file the recorder produced.
    } finally {
      if (recorder.uri) removeTemporaryAudio(recorder.uri);
      try { await restorePlaybackAudioMode(); } catch { /* Audio session cleanup is best effort. */ }
      recorderOperation.current = false;
    }
  }, [phase, recorder, restorePlaybackAudioMode]);

  const playAssistantMessage = useCallback(async (text: string, messageId: string) => {
    if (!conversationId || !enabled || !text.trim()) return;
    if (speechMessageIdRef.current) stopPlayback();
    const currentGeneration = ++generation.current;
    speechMessageIdRef.current = messageId;
    setSpeechMessageId(messageId);
    setSpeechLoading(true);
    setSpeechErrorMessageId(null);
    setError(null);
    setPhase('speaking');
    clearPlaybackFile();
    try {
      const audio = await synthesizeConversationSpeech(conversationId, text);
      if (!mounted.current || currentGeneration !== generation.current) return;
      const file = new File(Paths.cache, `englishai-conversation-${Date.now()}-${currentGeneration}.wav`);
      playbackFile.current = file;
      file.write(new Uint8Array(audio));
      if (!file.exists || file.size === 0) throw new Error('empty-wav-file');
      if (!mounted.current || currentGeneration !== generation.current) {
        clearPlaybackFile();
        return;
      }
      player.replace(file.uri);
      player.play();
      setSpeechLoading(false);
    } catch (error) {
      if (mounted.current && currentGeneration === generation.current) {
        clearPlaybackFile();
        speechMessageIdRef.current = null;
        setSpeechMessageId(null);
        setSpeechLoading(false);
        setSpeechErrorMessageId(messageId);
        setError(getConversationAudioErrorMessage(error));
        setPhase('error');
      }
    }
  }, [clearPlaybackFile, conversationId, enabled, player, stopPlayback]);

  const clearError = useCallback(() => {
    setError(null);
    if (phase === 'error') setPhase('idle');
  }, [phase]);

  const reportError = useCallback((message: string) => {
    setError(message);
    setPhase('error');
  }, []);

  return { cancelRecording, clearError, error, phase, playAssistantMessage, reportError, setPhase, startRecording, stopPlayback, stopRecording,
    speechMessageId, speechLoading, speechErrorMessageId, speechPlaying: playerStatus.playing };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { File } from 'expo-file-system';
import {
  getConversationAudioErrorMessage,
  removeTemporaryAudio,
  transcribeConversationAudio,
  type SpeechLanguage,
} from '../../conversations/conversation-audio.service';

export type TranslatorVoicePhase = 'idle' | 'requestingPermission' | 'recording' | 'transcribing' | 'error';

type UseTranslatorVoiceOptions = {
  language: SpeechLanguage;
  onTranscribed: (text: string) => void;
};

async function restorePlaybackAudioMode(): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    interruptionMode: 'doNotMix',
    playsInSilentMode: true,
    shouldRouteThroughEarpiece: false,
  });
}

export function useTranslatorVoice({ language, onTranscribed }: UseTranslatorVoiceOptions) {
  const [phase, setPhase] = useState<TranslatorVoicePhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const mounted = useRef(true);
  const operationInFlight = useRef(false);
  const recordingLanguage = useRef<SpeechLanguage>(language);
  const generation = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      void (async () => {
        try {
          if (recorder.isRecording) await recorder.stop();
          if (recorder.uri) removeTemporaryAudio(recorder.uri);
          await restorePlaybackAudioMode();
        } catch {
          // Recorder cleanup is best effort after the screen has unmounted.
        }
      })();
    };
  }, [recorder]);

  const startRecording = useCallback(async () => {
    if (operationInFlight.current || !mounted.current || (phase !== 'idle' && phase !== 'error')) return;
    operationInFlight.current = true;
    const currentGeneration = ++generation.current;
    recordingLanguage.current = language;
    setError(null);
    setPhase('requestingPermission');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!mounted.current || currentGeneration !== generation.current) return;
      if (!permission.granted) {
        setError('Permita o uso do microfone para ditar o texto.');
        setPhase('error');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (!mounted.current || currentGeneration !== generation.current) {
        await restorePlaybackAudioMode();
        return;
      }
      await recorder.prepareToRecordAsync();
      if (!mounted.current || currentGeneration !== generation.current) {
        await restorePlaybackAudioMode();
        return;
      }
      recorder.record();
      setPhase('recording');
    } catch {
      try { await restorePlaybackAudioMode(); } catch { /* Audio session cleanup is best effort. */ }
      if (mounted.current && currentGeneration === generation.current) {
        setError('Não foi possível iniciar a gravação. Tente novamente.');
        setPhase('error');
      }
    } finally {
      operationInFlight.current = false;
    }
  }, [language, phase, recorder]);

  const stopRecording = useCallback(async () => {
    if (phase !== 'recording' || operationInFlight.current) return;
    operationInFlight.current = true;
    const currentGeneration = ++generation.current;
    let recordedUri: string | null = null;
    try {
      await recorder.stop();
      recordedUri = recorder.uri;
      await restorePlaybackAudioMode();
      if (!recordedUri) throw new Error('missing-recording');
      const file = new File(recordedUri);
      if (!file.exists || file.size <= 0) throw new Error('empty-recording');
      if (!mounted.current || currentGeneration !== generation.current) return;
      setError(null);
      setPhase('transcribing');
      const transcription = await transcribeConversationAudio(
        { mimeType: 'audio/mp4', name: 'recording.m4a', uri: recordedUri },
        recordingLanguage.current,
      );
      if (!mounted.current || currentGeneration !== generation.current) return;
      const text = transcription.text;
      if (!text.trim()) {
        setError('Não consegui identificar sua fala. Tente novamente.');
        setPhase('error');
        return;
      }
      onTranscribed(text);
      setPhase('idle');
    } catch (reason) {
      if (mounted.current && currentGeneration === generation.current) {
        setError(reason instanceof Error && reason.message === 'empty-recording'
          ? 'A gravação ficou vazia. Tente novamente.'
          : getConversationAudioErrorMessage(reason));
        setPhase('error');
      }
      try { await restorePlaybackAudioMode(); } catch { /* Audio session cleanup is best effort. */ }
    } finally {
      if (recordedUri) removeTemporaryAudio(recordedUri);
      operationInFlight.current = false;
    }
  }, [onTranscribed, phase, recorder]);

  const cancelRecording = useCallback(async () => {
    if (phase !== 'recording' && phase !== 'requestingPermission') return;
    generation.current += 1;
    setError(null);
    setPhase('idle');
    if (phase === 'requestingPermission' && operationInFlight.current) return;
    if (operationInFlight.current) return; // stopRecording owns cleanup in this race.
    operationInFlight.current = true;
    try {
      await recorder.stop();
    } catch {
      // Cancellation still discards the recording even if native stop fails.
    } finally {
      if (recorder.uri) removeTemporaryAudio(recorder.uri);
      try { await restorePlaybackAudioMode(); } catch { /* Best effort. */ }
      operationInFlight.current = false;
    }
  }, [phase, recorder]);

  const clearError = useCallback(() => {
    setError(null);
    if (phase === 'error') setPhase('idle');
  }, [phase]);

  return { cancelRecording, clearError, error, phase, startRecording, stopRecording };
}

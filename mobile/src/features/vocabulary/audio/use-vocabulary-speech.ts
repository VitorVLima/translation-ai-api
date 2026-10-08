import { useCallback, useEffect, useRef, useState } from 'react';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { synthesizeSpeechForLanguage, type SpeechLanguage } from '../../conversations/conversation-audio.service';

export type VocabularySpeechKey = 'word' | 'example';

export function useVocabularySpeech() {
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const [activeKey, setActiveKey] = useState<VocabularySpeechKey | null>(null);
  const [loadingKey, setLoadingKey] = useState<VocabularySpeechKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const requestInFlight = useRef(false);
  const previousDidJustFinish = useRef(false);

  const clearFile = useCallback(() => {
    try { fileRef.current?.delete(); } catch { /* Cache cleanup is best effort. */ }
    fileRef.current = null;
  }, []);

  const stop = useCallback(() => {
    generation.current += 1;
    requestInFlight.current = false;
    if (mounted.current) {
      player.pause();
      setActiveKey(null);
      setLoadingKey(null);
    }
    clearFile();
  }, [clearFile, player]);

  useEffect(() => {
    if (playerStatus.error && mounted.current) {
      requestInFlight.current = false;
      clearFile();
      setActiveKey(null);
      setLoadingKey(null);
      setError('Não foi possível reproduzir o áudio.');
      return;
    }
    const finishedNow = playerStatus.didJustFinish && !previousDidJustFinish.current;
    previousDidJustFinish.current = playerStatus.didJustFinish;
    if (finishedNow) {
      requestInFlight.current = false;
      clearFile();
      setActiveKey(null);
      setLoadingKey(null);
    }
  }, [clearFile, playerStatus.didJustFinish, playerStatus.error]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      requestInFlight.current = false;
      clearFile();
    };
  }, [clearFile]);

  const play = useCallback(async (key: VocabularySpeechKey, text: string, language: SpeechLanguage = 'en') => {
    if (!text.trim() || requestInFlight.current) return;
    if (activeKey === key && playerStatus.playing) {
      stop();
      return;
    }
    stop();
    const currentGeneration = generation.current;
    requestInFlight.current = true;
    setError(null);
    setLoadingKey(key);
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        interruptionMode: 'doNotMix',
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
      });
      const audio = await synthesizeSpeechForLanguage(text, language);
      if (!mounted.current || currentGeneration !== generation.current) return;
      const file = new File(Paths.cache, `englishai-vocabulary-${Date.now()}-${currentGeneration}.wav`);
      fileRef.current = file;
      file.write(new Uint8Array(audio));
      if (!file.exists || file.size <= 0) throw new Error('empty-vocabulary-audio');
      if (!mounted.current || currentGeneration !== generation.current) {
        clearFile();
        return;
      }
      player.replace(file.uri);
      player.play();
      requestInFlight.current = false;
      setLoadingKey(null);
      setActiveKey(key);
    } catch {
      if (mounted.current && currentGeneration === generation.current) {
        requestInFlight.current = false;
        clearFile();
        setLoadingKey(null);
        setActiveKey(null);
        setError('Não foi possível reproduzir o áudio.');
      }
    }
  }, [activeKey, clearFile, player, playerStatus.playing, stop]);

  return { activeKey, error, loadingKey, play, stop };
}

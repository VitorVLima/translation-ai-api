import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import type { TranslatorVoicePhase } from '../../translator/audio/use-translator-voice';
import { compareVocabularyPronunciation } from '../vocabulary.presentation';
import { VocabularyAudioButton } from './VocabularyAudioButton';

type Props = {
  expected: string | null;
  recognized: string | null;
  completed: boolean;
  density: 0 | 1 | 2;
  phase: TranslatorVoicePhase;
  error: string | null;
  activeAudio: boolean;
  loadingAudio: boolean;
  onPlaySentence: () => void;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
};

export function VocabularyPronunciationPractice({ expected, recognized, completed, density, phase, error, activeAudio, loadingAudio, onPlaySentence, onStart, onStop, onCancel }: Props) {
  const styles = useThemedStyles(baseStyles);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (phase !== 'recording') return;
    const startedAt = Date.now();
    let active = true;
    queueMicrotask(() => { if (active) setElapsedSeconds(0); });
    const timer = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => { active = false; clearInterval(timer); };
  }, [phase]);

  if (!expected?.trim()) return null;
  const comparison = recognized ? compareVocabularyPronunciation(expected, recognized) : null;
  const busy = phase === 'requestingPermission' || phase === 'transcribing';
  const displayedSeconds = phase === 'recording' ? elapsedSeconds : 0;
  const elapsed = `${String(Math.floor(displayedSeconds / 60)).padStart(2, '0')}:${String(displayedSeconds % 60).padStart(2, '0')}`;

  return (
    <View style={[styles.container, density > 0 && styles.containerCompact, density === 2 && styles.containerTight, phase === 'recording' && styles.recordingContainer]}>
      <View style={styles.heading}>
        <Text style={styles.title}>Praticar pronúncia da frase</Text>
        <Text style={styles.optional}>Bônus · Opcional</Text>
      </View>
      {completed ? <Text style={[styles.completed, density > 0 && styles.completedCompact]}>✓ Pronúncia praticada nesta sessão</Text> : null}

      {phase === 'recording' ? (
        <View style={[styles.recordingBody, density > 0 && styles.recordingBodyCompact]}>
          <View style={styles.recordingHeading}>
            <View style={styles.recordingStatus}><View style={styles.recordingDot} /><Text style={styles.recordingText}>Gravando...</Text></View>
            <Text style={styles.timer}>{elapsed}</Text>
          </View>
          <View style={[styles.recordingActions, density > 0 && styles.recordingActionsCompact]}>
            <Pressable accessibilityLabel="Cancelar prática de pronúncia" accessibilityRole="button" onPress={onCancel} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
              <SymbolView accessible={false} name={{ ios: 'xmark', android: 'close', web: 'close' }} size={17} tintColor="#68728c" />
            </Pressable>
            <Pressable accessibilityLabel="Parar gravação e analisar frase" accessibilityRole="button" onPress={onStop} style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}>
              <SymbolView accessible={false} name={{ ios: 'stop.fill', android: 'stop', web: 'stop' }} size={15} tintColor="#ffffff" />
              <Text style={styles.stopText}>Parar gravação</Text>
            </Pressable>
          </View>
        </View>
      ) : busy ? (
        <View accessibilityLiveRegion="polite" style={[styles.statusBox, density > 0 && styles.statusBoxCompact]}>
          <ActivityIndicator color="#5b50f5" size="small" />
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>{phase === 'requestingPermission' ? 'Preparando microfone...' : 'Analisando sua fala...'}</Text>
            <Text style={styles.statusDescription}>{phase === 'requestingPermission' ? 'Permita o acesso para gravar sua frase.' : 'Aguarde um momento enquanto verificamos o que você disse.'}</Text>
          </View>
        </View>
      ) : (
        <>
          {phase === 'idle' && comparison ? (
            <View accessibilityLiveRegion="polite" style={[styles.feedback, density > 0 && styles.feedbackCompact, density === 2 && styles.feedbackTight, comparison.status === 'recognized' ? styles.successFeedback : comparison.status === 'close' ? styles.differenceFeedback : styles.retryFeedback]}>
              <Text style={styles.feedbackTitle}>{comparison.status === 'recognized' ? '✓ Muito bem!' : comparison.status === 'close' ? '⚠ Quase lá!' : '✕ Não foi reconhecido'}</Text>
              <Text style={styles.feedbackDescription}>{comparison.status === 'recognized' ? 'A frase foi reconhecida corretamente.' : comparison.status === 'close' ? 'O reconhecimento foi diferente em alguns trechos.' : 'Algumas palavras não foram reconhecidas como esperado. Tente novamente em um ambiente mais silencioso.'}</Text>
              {comparison.status === 'recognized' ? <Text style={styles.recognizedPhrase}>{recognized}</Text> : <>
                <Text style={[styles.detailLabel, density > 0 && styles.detailLabelCompact]}>Frase esperada</Text>
                <Text style={styles.phrase}>{comparison.expectedSegments.map((segment, index) => (
                  <Text key={`expected-${index}`} style={segment.changed ? styles.expectedWord : undefined}>{segment.text}</Text>
                ))}</Text>
                <Text style={[styles.detailLabel, density > 0 && styles.detailLabelCompact]}>Você disse</Text>
                <Text style={styles.phrase}>{comparison.recognizedSegments.map((segment, index) => (
                  <Text key={`recognized-${index}`} style={segment.changed ? styles.recognizedWord : undefined}>{segment.text}</Text>
                ))}</Text>
              </>}
            </View>
          ) : phase === 'error' ? (
            <View accessibilityLiveRegion="polite" style={[styles.feedback, density > 0 && styles.feedbackCompact, density === 2 && styles.feedbackTight, styles.retryFeedback]}>
              <Text style={styles.feedbackTitle}>Não foi possível analisar</Text>
              <Text style={styles.feedbackDescription}>{error ?? 'Tente gravar a frase novamente.'}</Text>
            </View>
          ) : <Text style={[styles.intro, density > 0 && styles.introCompact]}>Ouça a frase e tente repeti-la. Você receberá um feedback sobre o que foi reconhecido.</Text>}
          <View style={[styles.actions, density > 0 && styles.actionsCompact]}>
            <VocabularyAudioButton accessibilityLabel="Ouvir frase" label="Ouvir frase" loading={loadingAudio} onPress={onPlaySentence} playing={activeAudio} />
            <Pressable accessibilityRole="button" accessibilityLabel={recognized || phase === 'error' ? 'Tentar praticar a frase novamente' : 'Praticar frase'} onPress={onStart} style={({ pressed }) => [styles.practiceButton, pressed && styles.pressed]}>
              <SymbolView accessible={false} name={{ ios: 'mic.fill', android: 'mic', web: 'mic' }} size={17} tintColor="#ffffff" />
              <Text style={styles.practiceText}>{recognized || phase === 'error' ? 'Tentar novamente' : 'Praticar frase'}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { backgroundColor: '#f7f5ff', borderColor: '#e1dcfb', borderRadius: 17, borderWidth: 1, marginTop: 12, padding: 15 },
  containerCompact: { marginTop: 8, paddingVertical: 12 },
  containerTight: { marginTop: 5, paddingVertical: 9 },
  recordingContainer: { backgroundColor: '#fff8f8', borderColor: '#f5d8dc' },
  heading: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'space-between' },
  title: { color: '#25213e', flexShrink: 1, fontSize: 15, fontWeight: '800' },
  optional: { backgroundColor: '#e8e3ff', borderRadius: 8, color: '#5147b8', fontSize: 10, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 4 },
  completed: { color: '#257348', fontSize: 12, fontWeight: '700', marginTop: 8 },
  completedCompact: { marginTop: 4 },
  intro: { color: '#69728c', fontSize: 13, lineHeight: 19, marginTop: 9 },
  introCompact: { marginTop: 5 },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionsCompact: { marginTop: 7 },
  practiceButton: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 11, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 40, paddingHorizontal: 12 },
  practiceText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  recordingBody: { marginTop: 13 },
  recordingBodyCompact: { marginTop: 7 },
  recordingHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  recordingStatus: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  recordingDot: { backgroundColor: '#d74756', borderRadius: 6, height: 11, width: 11 },
  recordingText: { color: '#a63145', fontSize: 14, fontWeight: '800' },
  timer: { color: '#a63145', fontSize: 15, fontVariant: ['tabular-nums'], fontWeight: '800' },
  recordingActions: { flexDirection: 'row', gap: 9, marginTop: 13 },
  recordingActionsCompact: { marginTop: 7 },
  cancelButton: { alignItems: 'center', backgroundColor: '#f0f1f7', borderRadius: 11, height: 42, justifyContent: 'center', width: 42 },
  stopButton: { alignItems: 'center', backgroundColor: '#c13e53', borderRadius: 11, flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 42 },
  stopText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  statusBox: { alignItems: 'center', backgroundColor: '#eeebff', borderRadius: 12, flexDirection: 'row', gap: 12, marginTop: 12, padding: 13 },
  statusBoxCompact: { marginTop: 7, paddingVertical: 9 },
  statusCopy: { flex: 1 },
  statusTitle: { color: '#363175', fontSize: 13, fontWeight: '800' },
  statusDescription: { color: '#69728c', fontSize: 12, lineHeight: 18, marginTop: 3 },
  feedback: { borderRadius: 12, marginTop: 12, padding: 12 },
  feedbackCompact: { marginTop: 7, paddingVertical: 9 },
  feedbackTight: { marginTop: 5, paddingVertical: 7 },
  successFeedback: { backgroundColor: '#e9f7ee' },
  differenceFeedback: { backgroundColor: '#fff4e6' },
  retryFeedback: { backgroundColor: '#fff0f1' },
  feedbackTitle: { color: '#28243e', fontSize: 15, fontWeight: '800' },
  feedbackDescription: { color: '#606981', fontSize: 12, lineHeight: 18, marginTop: 4 },
  recognizedPhrase: { color: '#2c6540', fontSize: 13, lineHeight: 19, marginTop: 8 },
  detailLabel: { color: '#69728c', fontSize: 10, fontWeight: '800', marginTop: 9, textTransform: 'uppercase' },
  detailLabelCompact: { marginTop: 5 },
  phrase: { color: '#34324a', fontSize: 12, lineHeight: 18, marginTop: 3 },
  expectedWord: { backgroundColor: '#fbe4e7', color: '#9e3544', fontWeight: '800' },
  recognizedWord: { backgroundColor: '#fff0ce', color: '#855900', fontWeight: '800' },
  pressed: { opacity: 0.75 },
});

import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useCallback, useRef, useState } from 'react';
import { router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { useDeterministicBack } from '../../../hooks/use-deterministic-back';
import { useVocabularySpeech } from '../../vocabulary/audio/use-vocabulary-speech';
import { useTranslatorVoice } from '../../translator/audio/use-translator-voice';
import { CorrectionRequestError, correctText, CORRECTION_MAX_CHARACTERS, getCorrectionErrorMessage, getCorrectionTitle } from '../correction.service';
import type { CorrectionResponse } from '../correction.types';

export function CorrectionScreen() {
  const styles = useThemedStyles(baseStyles);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<CorrectionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [isLearningExpanded, setIsLearningExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const speech = useVocabularySpeech();
  const submitting = useRef(false);

  const goToPractice = useCallback(() => router.replace('/practice'), []);
  useDeterministicBack(goToPractice);

  const clearResult = useCallback(() => {
    setResult(null);
    setIsLearningExpanded(false);
    setCopied(false);
  }, []);

  const runCorrection = useCallback(async (textToCorrect: string) => {
    if (submitting.current) return;
    const text = textToCorrect.trim();
    if (!text || text.length > CORRECTION_MAX_CHARACTERS) {
      setError(getCorrectionErrorMessage(new CorrectionRequestError('validation')));
      return;
    }
    submitting.current = true;
    speech.stop();
    clearResult();
    setError(null);
    setIsCorrecting(true);
    try {
      setResult(await correctText(text));
    } catch (reason) {
      setError(getCorrectionErrorMessage(reason));
    } finally {
      submitting.current = false;
      setIsCorrecting(false);
    }
  }, [clearResult, speech]);

  const handleTranscription = useCallback((text: string) => {
    setInput(text);
    void runCorrection(text);
  }, [runCorrection]);
  const voice = useTranslatorVoice({ language: 'en', onTranscribed: handleTranscription });
  const voiceBusy = voice.phase === 'requestingPermission' || voice.phase === 'recording' || voice.phase === 'transcribing';

  const handleCorrect = useCallback(() => {
    if (voiceBusy) return;
    void runCorrection(input);
  }, [input, runCorrection, voiceBusy]);

  const handleInputChange = useCallback((value: string) => {
    if (speech.activeKey || speech.loadingKey) speech.stop();
    voice.clearError();
    setInput(value);
    clearResult();
    setError(null);
  }, [clearResult, speech, voice]);

  const handleClear = useCallback(() => {
    if (voiceBusy || isCorrecting) return;
    speech.stop();
    voice.clearError();
    setInput('');
    clearResult();
    setError(null);
  }, [clearResult, isCorrecting, speech, voice, voiceBusy]);

  const handleCopy = useCallback(async () => {
    if (!result?.correctedText) return;
    try {
      await Clipboard.setStringAsync(result.correctedText);
      setCopied(true);
      setError(null);
    } catch {
      setError('Não foi possível copiar o texto corrigido.');
    }
  }, [result]);

  const playCorrected = useCallback(() => {
    if (!result?.correctedText || isCorrecting || voiceBusy || speech.loadingKey) return;
    void speech.play('word', result.correctedText, 'en');
  }, [isCorrecting, result, speech, voiceBusy]);

  const learningAvailable = Boolean(result && (result.explanation?.trim() || result.usageTip?.trim() || result.alternatives.length || result.examples.length));
  const correctedPlaying = speech.activeKey === 'word';
  const correctedLoading = speech.loadingKey === 'word';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}><ScreenHeader onBack={goToPractice} title="Correção" /></View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboard}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.inputCard}>
            <View style={styles.heading}>
              <Text style={styles.headingTitle}>Seu texto</Text>
              <Text style={styles.counter}>{input.length}/{CORRECTION_MAX_CHARACTERS}</Text>
            </View>
            <TextInput
              accessibilityLabel="Texto em inglês para corrigir"
              editable={!voiceBusy && !isCorrecting}
              maxLength={CORRECTION_MAX_CHARACTERS}
              multiline
              onChangeText={handleInputChange}
              placeholder="Digite uma frase em inglês"
              placeholderTextColor="#8b91a7"
              style={styles.input}
              textAlignVertical="top"
              value={input}
            />
            <View style={styles.actions}>
              <Pressable
                accessibilityLabel={voice.phase === 'recording' ? 'Parar gravação' : 'Gravar texto para corrigir'}
                accessibilityRole="button"
                accessibilityState={{ busy: voice.phase === 'requestingPermission' || voice.phase === 'transcribing', disabled: isCorrecting || voice.phase === 'requestingPermission' || voice.phase === 'transcribing' }}
                disabled={isCorrecting || voice.phase === 'requestingPermission' || voice.phase === 'transcribing'}
                onPress={() => {
                  speech.stop();
                  void (voice.phase === 'recording' ? voice.stopRecording() : voice.startRecording());
                }}
                style={({ pressed }) => [styles.iconButton, voice.phase === 'recording' && styles.recording, pressed && styles.pressed]}
              >
                {voice.phase === 'requestingPermission' || voice.phase === 'transcribing' ? <ActivityIndicator color="#5b50f5" size="small" /> : <SymbolView accessible={false} name={voice.phase === 'recording' ? { ios: 'stop.fill', android: 'stop', web: 'stop' } : { ios: 'mic.fill', android: 'mic', web: 'mic' }} size={21} tintColor="#5b50f5" />}
              </Pressable>
              {voice.phase === 'recording' ? <Pressable accessibilityLabel="Cancelar gravação" accessibilityRole="button"
                onPress={() => void voice.cancelRecording()} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                <SymbolView accessible={false} name={{ ios: 'xmark', android: 'close', web: 'close' }} size={19} tintColor="#8f3c42" />
              </Pressable> : null}
              <Pressable
                accessibilityLabel="Corrigir texto"
                accessibilityRole="button"
                accessibilityState={{ busy: isCorrecting, disabled: isCorrecting || voiceBusy || !input.trim() }}
                disabled={isCorrecting || voiceBusy || !input.trim()}
                onPress={handleCorrect}
                style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
              >
                {isCorrecting ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.primaryText}>Corrigir</Text>}
              </Pressable>
              <Pressable accessibilityLabel="Limpar texto e resultado" accessibilityRole="button" disabled={voiceBusy || isCorrecting || (!input && !result && !error)} onPress={handleClear} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                <SymbolView accessible={false} name={{ ios: 'trash', android: 'delete_outline', web: 'delete_outline' }} size={20} tintColor="#5b50f5" />
              </Pressable>
            </View>
            {voice.phase === 'recording' ? <Text style={styles.voiceStatus}>Gravando... toque novamente para parar.</Text> : null}
            {voice.phase === 'transcribing' ? <Text style={styles.voiceStatus}>Transcrevendo sua fala...</Text> : null}
          </View>

          {error ? <View><Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>{input.trim() ? <Pressable accessibilityRole="button" onPress={handleCorrect} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}><Text style={styles.retryText}>Tentar novamente</Text></Pressable> : null}</View> : null}

          {result ? (
            <View style={styles.resultCard}>
              <View style={styles.resultHeading}>
                <SymbolView accessible={false} name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={22} tintColor="#159447" />
                <Text style={styles.resultLabel}>{getCorrectionTitle(result.status)}</Text>
              </View>
              <Text selectable style={styles.resultText}>{result.correctedText}</Text>
              <View style={styles.resultActions}>
                <Pressable accessibilityLabel={correctedLoading ? 'Carregando áudio do texto corrigido' : correctedPlaying ? 'Parar áudio do texto corrigido' : 'Ouvir texto corrigido'} accessibilityRole="button"
                  accessibilityState={{ busy: correctedLoading, disabled: isCorrecting || voiceBusy || correctedLoading }}
                  disabled={isCorrecting || voiceBusy || correctedLoading} onPress={playCorrected}
                  style={({ pressed }) => [styles.resultAction, styles.audioAction, pressed && styles.pressed]}>
                  {correctedLoading ? <ActivityIndicator color="#5b50f5" size="small" /> : <SymbolView accessible={false} name={correctedPlaying ? { ios: 'stop.fill', android: 'stop', web: 'stop' } : { ios: 'speaker.wave.2.fill', android: 'volume_up', web: 'volume_up' }} size={18} tintColor="#5b50f5" />}
                  <Text style={styles.actionText}>{correctedLoading ? 'Carregando...' : correctedPlaying ? 'Parar' : 'Ouvir'}</Text>
                </Pressable>
                <Pressable accessibilityLabel="Copiar texto corrigido" accessibilityRole="button" onPress={() => void handleCopy()} style={({ pressed }) => [styles.resultAction, pressed && styles.pressed]}>
                  <SymbolView accessible={false} name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }} size={18} tintColor="#5b50f5" />
                  <Text style={styles.actionText}>{copied ? 'Copiado' : 'Copiar'}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {result && learningAvailable ? (
            <View style={styles.learningCard}>
              <Pressable accessibilityLabel={isLearningExpanded ? 'Recolher explicação da correção' : 'Expandir explicação da correção'} accessibilityRole="button" accessibilityState={{ expanded: isLearningExpanded }} onPress={() => setIsLearningExpanded((expanded) => !expanded)} style={({ pressed }) => [styles.learningToggle, pressed && styles.pressed]}>
                <SymbolView accessible={false} name={{ ios: 'graduationcap', android: 'school', web: 'school' }} size={21} tintColor="#5b50f5" />
                <View style={styles.learningCopy}>
                  <Text style={styles.learningTitle}>Entenda a correção</Text>
                  {!isLearningExpanded ? <Text style={styles.learningHint}>Explicação disponível</Text> : null}
                </View>
                <SymbolView accessible={false} name={isLearningExpanded ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' } : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={21} tintColor="#5147df" />
              </Pressable>
              {isLearningExpanded ? <View style={styles.learningDetails}>
                {result.explanation ? <><Text style={styles.detailTitle}>Por quê?</Text><Text style={styles.detailText}>{result.explanation}</Text></> : null}
                {result.usageTip ? <><Text style={styles.detailTitle}>Dica de uso</Text><Text style={styles.detailText}>{result.usageTip}</Text></> : null}
                {result.alternatives.length ? <><Text style={styles.detailTitle}>Alternativas</Text>{result.alternatives.map((alternative) => <Text key={alternative} style={styles.detailText}>• {alternative}</Text>)}</> : null}
                {result.examples.length ? <><Text style={styles.detailTitle}>Outros exemplos</Text>{result.examples.map((example, index) => <View key={`${example.text}-${index}`} style={styles.example}><Text style={styles.exampleIndex}>{index + 1}</Text><View style={styles.exampleCopy}><Text style={styles.exampleText}>{example.text}</Text><Text style={styles.exampleTranslation}>{example.translation}</Text></View></View>)}</> : null}
              </View> : null}
            </View>
          ) : null}
          {speech.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{speech.error}</Text> : null}
          {voice.error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{voice.error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const baseStyles = StyleSheet.create({
  screen: { backgroundColor: '#f8f9ff', flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 2 },
  keyboard: { flex: 1 },
  content: { paddingBottom: 18, paddingHorizontal: 16 },
  inputCard: { backgroundColor: '#ffffff', borderColor: '#e3e5f0', borderRadius: 15, borderWidth: 1, padding: 11 },
  heading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headingTitle: { color: '#242136', fontSize: 15, fontWeight: '800' },
  counter: { color: '#7d849a', fontSize: 11 },
  input: { color: '#242136', fontSize: 16, lineHeight: 21, maxHeight: 120, minHeight: 82, paddingHorizontal: 0, paddingVertical: 6 },
  actions: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 7 },
  iconButton: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#d9dbea', borderRadius: 11, borderWidth: 1, height: 46, justifyContent: 'center', width: 48 },
  primary: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 12, flex: 1, justifyContent: 'center', minHeight: 46, paddingHorizontal: 16 },
  primaryText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  recording: { backgroundColor: '#fbe7eb', borderColor: '#d67b89' },
  voiceStatus: { color: '#5147df', fontSize: 12, lineHeight: 17, marginTop: 6 },
  resultCard: { backgroundColor: '#eeecff', borderRadius: 15, marginTop: 10, padding: 12 },
  resultHeading: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  resultLabel: { color: '#5147df', fontSize: 14, fontWeight: '800' },
  resultText: { color: '#292344', fontSize: 18, fontWeight: '700', lineHeight: 25, marginLeft: 30, marginTop: 4 },
  resultActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 9, paddingLeft: 30 },
  resultAction: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.74)', borderRadius: 10, flexDirection: 'row', gap: 5, minHeight: 38, paddingHorizontal: 12 },
  audioAction: { minWidth: 120 },
  actionText: { color: '#5147df', fontSize: 12, fontWeight: '700' },
  learningCard: { backgroundColor: '#eeecff', borderRadius: 14, marginTop: 10, padding: 10 },
  learningToggle: { alignItems: 'center', flexDirection: 'row', minHeight: 42 },
  learningCopy: { flex: 1, marginLeft: 9 },
  learningTitle: { color: '#342b76', fontSize: 14, fontWeight: '800' },
  learningHint: { color: '#68728c', fontSize: 12, lineHeight: 17, marginTop: 2 },
  learningDetails: { marginTop: 8, paddingLeft: 30 },
  detailTitle: { color: '#342b76', fontSize: 13, fontWeight: '800', marginTop: 8 },
  detailText: { color: '#4b4670', fontSize: 13, lineHeight: 19, marginTop: 3 },
  example: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 9, flexDirection: 'row', gap: 8, marginTop: 6, padding: 7 },
  exampleIndex: { backgroundColor: '#e8e5ff', borderRadius: 14, color: '#5147df', fontSize: 12, fontWeight: '800', height: 28, lineHeight: 28, textAlign: 'center', width: 28 },
  exampleCopy: { flex: 1 },
  exampleText: { color: '#292344', fontSize: 13, lineHeight: 18 },
  exampleTranslation: { color: '#686182', fontSize: 12, lineHeight: 17, marginTop: 2 },
  error: { color: '#984b58', fontSize: 12, lineHeight: 18, marginTop: 9 },
  retry: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 38, paddingHorizontal: 2 },
  retryText: { color: '#5147df', fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.68 },
});

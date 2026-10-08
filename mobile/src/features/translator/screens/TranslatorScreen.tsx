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
import { useTranslatorVoice } from '../audio/use-translator-voice';
import {
  getLanguageLabel,
  getTranslationErrorMessage,
  getTranslationPlaceholder,
  translateText,
} from '../translator.service';
import type { TranslationEnrichment, TranslationLanguage } from '../translator.types';

const MAX_CHARACTERS = 5000;

export function TranslatorScreen() {
  const styles = useThemedStyles(baseStyles);
  const [sourceLanguage, setSourceLanguage] = useState<TranslationLanguage>('pt');
  const [targetLanguage, setTargetLanguage] = useState<TranslationLanguage>('en');
  const [input, setInput] = useState('');
  const [translation, setTranslation] = useState<string | null>(null);
  const [enrichment, setEnrichment] = useState<TranslationEnrichment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isEnrichmentExpanded, setIsEnrichmentExpanded] = useState(false);
  const submitting = useRef(false);
  const speech = useVocabularySpeech();

  const goToPractice = useCallback(() => router.replace('/practice'), []);
  useDeterministicBack(goToPractice);

  const clearResult = useCallback(() => {
    setTranslation(null);
    setEnrichment(null);
    setCopied(false);
    setIsEnrichmentExpanded(false);
  }, []);

  const runTranslation = useCallback(async (textToTranslate: string) => {
    if (submitting.current) return;
    const text = textToTranslate.trim();
    if (!text) {
      setError('Digite um texto para traduzir.');
      return;
    }
    if (text.length > MAX_CHARACTERS) {
      setError(`O texto deve ter no máximo ${MAX_CHARACTERS} caracteres.`);
      return;
    }

    submitting.current = true;
    speech.stop();
    clearResult();
    setError(null);
    setIsTranslating(true);
    try {
      const result = await translateText({ text, sourceLanguage, targetLanguage });
      setTranslation(result.translation);
      setEnrichment(result.enrichment);
    } catch (reason) {
      setError(getTranslationErrorMessage(reason));
    } finally {
      submitting.current = false;
      setIsTranslating(false);
    }
  }, [clearResult, sourceLanguage, speech, targetLanguage]);

  const handleTranscription = useCallback((text: string) => {
    setInput(text);
    void runTranslation(text);
  }, [runTranslation]);

  const voice = useTranslatorVoice({ language: sourceLanguage, onTranscribed: handleTranscription });
  const voiceBusy = voice.phase === 'requestingPermission' || voice.phase === 'recording' || voice.phase === 'transcribing';

  const handleTranslate = useCallback(() => {
    if (voiceBusy) return;
    void runTranslation(input);
  }, [input, runTranslation, voiceBusy]);

  const handleInputChange = useCallback((value: string) => {
    if (speech.activeKey || speech.loadingKey) speech.stop();
    voice.clearError();
    setInput(value);
    clearResult();
    setError(null);
  }, [clearResult, speech, voice]);

  const handleSwap = useCallback(() => {
    if (voiceBusy || isTranslating) return;
    if (speech.activeKey || speech.loadingKey) speech.stop();
    voice.clearError();
    const currentTranslation = translation?.trim();
    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage);
    setInput(currentTranslation || input);
    clearResult();
    setError(null);
  }, [clearResult, input, isTranslating, speech, sourceLanguage, targetLanguage, translation, voice, voiceBusy]);

  const handleClear = useCallback(() => {
    if (voiceBusy || isTranslating) return;
    speech.stop();
    voice.clearError();
    setInput('');
    clearResult();
    setError(null);
  }, [clearResult, isTranslating, speech, voice, voiceBusy]);

  const handleCopy = useCallback(async () => {
    if (!translation) return;
    try {
      await Clipboard.setStringAsync(translation);
      setCopied(true);
      setError(null);
    } catch {
      setError('Não foi possível copiar a tradução.');
    }
  }, [translation]);

  const playOriginal = useCallback(() => {
    if (!input.trim() || isTranslating || voiceBusy || speech.loadingKey) return;
    void speech.play('word', input.trim(), sourceLanguage);
  }, [input, isTranslating, sourceLanguage, speech, voiceBusy]);

  const playTranslation = useCallback(() => {
    if (!translation || isTranslating || voiceBusy || speech.loadingKey) return;
    void speech.play('example', translation, targetLanguage);
  }, [isTranslating, speech, targetLanguage, translation, voiceBusy]);

  const originalPlaying = speech.activeKey === 'word';
  const translationPlaying = speech.activeKey === 'example';
  const originalLoading = speech.loadingKey === 'word';
  const translationLoading = speech.loadingKey === 'example';
  const hasEnrichment = Boolean(enrichment && (enrichment.usage?.trim() || enrichment.examples.length));

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <ScreenHeader onBack={goToPractice} title="Tradutor" />
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboard}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View accessibilityRole="radiogroup" style={styles.languageRow}>
            <View style={styles.languagePill}>
              <Text style={styles.languageFlag}>{sourceLanguage === 'pt' ? '🇧🇷' : '🇺🇸'}</Text>
              <View style={styles.languageCopy}>
                <Text style={styles.languageCaption}>Origem</Text>
                <Text style={styles.languageValue}>{getLanguageLabel(sourceLanguage)}</Text>
              </View>
            </View>
            <Pressable
              accessibilityHint="Inverte os idiomas de origem e destino"
              accessibilityLabel="Inverter idiomas"
              accessibilityRole="button"
              accessibilityState={{ disabled: voiceBusy || isTranslating }}
              disabled={voiceBusy || isTranslating}
              onPress={handleSwap}
              style={({ pressed }) => [styles.swapButton, pressed && styles.pressed]}
            >
              <Text style={styles.swapText}>⇄</Text>
            </Pressable>
            <View style={styles.languagePill}>
              <Text style={styles.languageFlag}>{targetLanguage === 'pt' ? '🇧🇷' : '🇺🇸'}</Text>
              <View style={styles.languageCopy}>
                <Text style={styles.languageCaption}>Destino</Text>
                <Text style={styles.languageValue}>{getLanguageLabel(targetLanguage)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Seu texto</Text>
              <Text style={styles.counter}>{input.length}/{MAX_CHARACTERS}</Text>
            </View>
            <TextInput
              accessibilityLabel={`Texto em ${getLanguageLabel(sourceLanguage)}`}
              editable={!voiceBusy && !isTranslating}
              maxLength={MAX_CHARACTERS}
              multiline
              onChangeText={handleInputChange}
              placeholder={getTranslationPlaceholder(sourceLanguage)}
              placeholderTextColor="#8b91a7"
              style={styles.input}
              textAlignVertical="top"
              value={input}
            />
            <View style={styles.compactActions}>
              <Pressable
                accessibilityLabel={voice.phase === 'recording' ? 'Parar gravação' : 'Gravar texto para traduzir'}
                accessibilityRole="button"
                accessibilityState={{
                  busy: voice.phase === 'requestingPermission' || voice.phase === 'transcribing',
                  disabled: isTranslating || voice.phase === 'requestingPermission' || voice.phase === 'transcribing',
                }}
                disabled={isTranslating || voice.phase === 'requestingPermission' || voice.phase === 'transcribing'}
                onPress={() => {
                  speech.stop();
                  void (voice.phase === 'recording' ? voice.stopRecording() : voice.startRecording());
                }}
                style={({ pressed }) => [styles.iconButton, voice.phase === 'recording' && styles.recordingButton, pressed && styles.pressed]}
              >
                {voice.phase === 'requestingPermission' || voice.phase === 'transcribing'
                  ? <ActivityIndicator color="#5b50f5" size="small" />
                  : <SymbolView accessible={false} name={voice.phase === 'recording' ? { ios: 'stop.fill', android: 'stop', web: 'stop' } : { ios: 'mic.fill', android: 'mic', web: 'mic' }} size={21} tintColor="#5b50f5" />}
              </Pressable>
              {voice.phase === 'recording' ? <Pressable
                accessibilityLabel="Cancelar gravação"
                accessibilityRole="button"
                onPress={() => void voice.cancelRecording()}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <SymbolView accessible={false} name={{ ios: 'xmark', android: 'close', web: 'close' }} size={19} tintColor="#8f3c42" />
              </Pressable> : null}
              <Pressable
                accessibilityLabel="Traduzir texto"
                accessibilityRole="button"
                accessibilityState={{ busy: isTranslating, disabled: isTranslating || voiceBusy || !input.trim() }}
                disabled={isTranslating || voiceBusy || !input.trim()}
                onPress={handleTranslate}
                style={({ pressed }) => [styles.primaryButton, styles.compactTranslate, (pressed || isTranslating) && styles.primaryButtonPressed]}
              >
                {isTranslating ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.primaryButtonText}>Traduzir</Text>}
              </Pressable>
              <Pressable
                accessibilityLabel="Limpar texto e resultado"
                accessibilityRole="button"
                disabled={voiceBusy || isTranslating || (!input && !translation && !error)}
                onPress={handleClear}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <SymbolView accessible={false} name={{ ios: 'trash', android: 'delete_outline', web: 'delete_outline' }} size={20} tintColor="#5b50f5" />
              </Pressable>
            </View>
            {voice.phase === 'recording' ? <Text style={styles.voiceStatus}>Gravando... toque novamente para parar.</Text> : null}
            {voice.phase === 'transcribing' ? <Text style={styles.voiceStatus}>Transcrevendo sua fala...</Text> : null}
          </View>

          {error ? (
            <View>
              <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>
              {input.trim() ? (
                <Pressable
                  accessibilityLabel="Tentar traduzir novamente"
                  accessibilityRole="button"
                  disabled={isTranslating}
                  onPress={handleTranslate}
                  style={({ pressed }) => [styles.retry, pressed && styles.pressed]}
                >
                  <Text style={styles.retryText}>Tentar novamente</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {translation ? (
            <View style={styles.resultCard}>
              <Text style={styles.resultLabel}>Tradução</Text>
              <Text selectable style={styles.resultText}>{translation}</Text>
              <View style={styles.resultActions}>
                <Pressable
                  accessibilityLabel={originalLoading ? 'Carregando áudio do texto original' : originalPlaying ? 'Parar áudio do texto original' : 'Ouvir texto original'}
                  accessibilityRole="button"
                  accessibilityState={{ busy: originalLoading, disabled: isTranslating || voiceBusy || !input.trim() || speech.loadingKey !== null }}
                  disabled={isTranslating || voiceBusy || !input.trim() || speech.loadingKey !== null}
                  onPress={playOriginal}
                  style={({ pressed }) => [styles.resultAction, styles.audioAction, pressed && styles.pressed]}
                >
                  {originalLoading ? <ActivityIndicator color="#5b50f5" size="small" /> : <SymbolView accessible={false} name={originalPlaying ? { ios: 'stop.fill', android: 'stop', web: 'stop' } : { ios: 'speaker.wave.2.fill', android: 'volume_up', web: 'volume_up' }} size={18} tintColor="#5b50f5" />}
                  <Text style={styles.resultActionText}>{originalLoading ? 'Carregando...' : originalPlaying ? 'Parar' : 'Original'}</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={translationLoading ? 'Carregando áudio da tradução' : translationPlaying ? 'Parar áudio da tradução' : 'Ouvir tradução'}
                  accessibilityRole="button"
                  accessibilityState={{ busy: translationLoading, disabled: isTranslating || voiceBusy || speech.loadingKey !== null }}
                  disabled={isTranslating || voiceBusy || speech.loadingKey !== null}
                  onPress={playTranslation}
                  style={({ pressed }) => [styles.resultAction, styles.audioAction, pressed && styles.pressed]}
                >
                  {translationLoading ? <ActivityIndicator color="#5b50f5" size="small" /> : <SymbolView accessible={false} name={translationPlaying ? { ios: 'stop.fill', android: 'stop', web: 'stop' } : { ios: 'speaker.wave.2.fill', android: 'volume_up', web: 'volume_up' }} size={18} tintColor="#5b50f5" />}
                  <Text style={styles.resultActionText}>{translationLoading ? 'Carregando...' : translationPlaying ? 'Parar' : 'Tradução'}</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Copiar tradução"
                  accessibilityRole="button"
                  onPress={() => void handleCopy()}
                  style={({ pressed }) => [styles.resultAction, pressed && styles.pressed]}
                >
                  <SymbolView accessible={false} name={{ ios: 'doc.on.doc', android: 'content_copy', web: 'content_copy' }} size={18} tintColor="#5b50f5" />
                  <Text style={styles.resultActionText}>{copied ? 'Copiado' : 'Copiar'}</Text>
                </Pressable>
              </View>
              {hasEnrichment ? (
                <View style={styles.enrichment}>
                  <Pressable
                    accessibilityLabel={isEnrichmentExpanded ? 'Recolher explicação e exemplos' : 'Expandir explicação e exemplos'}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isEnrichmentExpanded }}
                    onPress={() => setIsEnrichmentExpanded((expanded) => !expanded)}
                    style={({ pressed }) => [styles.enrichmentToggle, pressed && styles.pressed]}
                  >
                    <SymbolView accessible={false} name={{ ios: 'graduationcap', android: 'school', web: 'school' }} size={20} tintColor={isEnrichmentExpanded ? '#2d8b57' : '#5b50f5'} />
                    <View style={styles.enrichmentToggleCopy}>
                      <Text style={styles.enrichmentTitle}>Explicação e exemplos</Text>
                      {!isEnrichmentExpanded ? <Text style={styles.enrichmentHint}>Veja o uso desta expressão em inglês</Text> : null}
                    </View>
                    <SymbolView accessible={false} name={isEnrichmentExpanded ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' } : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={21} tintColor="#5147df" />
                  </Pressable>
                  <View style={isEnrichmentExpanded ? styles.enrichmentDetails : styles.hiddenDetails}>
                  <Text style={styles.detailHeading}>Explicação</Text>
                  {enrichment?.usage ? <Text style={styles.usage}>{enrichment.usage}</Text> : null}
                  {enrichment?.examples.length ? <Text style={styles.detailHeading}>Exemplos</Text> : null}
                  {enrichment?.examples.map((example, index) => (
                    <View key={`${example.text}-${index}`} style={styles.example}>
                      <Text style={styles.exampleIndex}>{index + 1}</Text>
                      <View style={styles.exampleCopy}>
                        <Text style={styles.exampleText}>{example.text}</Text>
                        <Text style={styles.exampleTranslation}>{example.translation}</Text>
                      </View>
                    </View>
                  ))}
                  </View>
                </View>
              ) : null}
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
  languageRow: { alignItems: 'center', flexDirection: 'row', gap: 7, marginBottom: 8 },
  languagePill: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e0e2ee', borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: 'row', minHeight: 50, paddingHorizontal: 10 },
  languageFlag: { fontSize: 21, marginRight: 8 },
  languageCopy: { flex: 1 },
  languageCaption: { color: '#858ba0', fontSize: 11, fontWeight: '600' },
  languageValue: { color: '#282445', fontSize: 15, fontWeight: '800', marginTop: 2 },
  swapButton: { alignItems: 'center', backgroundColor: '#eeecff', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  swapText: { color: '#5b50f5', fontSize: 23, lineHeight: 26 },
  sectionCard: { backgroundColor: '#ffffff', borderColor: '#e3e5f0', borderRadius: 14, borderWidth: 1, padding: 10 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { color: '#242136', fontSize: 15, fontWeight: '800' },
  counter: { color: '#7d849a', fontSize: 11 },
  input: { color: '#242136', fontSize: 16, lineHeight: 21, maxHeight: 120, minHeight: 82, paddingHorizontal: 0, paddingVertical: 6 },
  compactActions: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 7 },
  iconButton: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#d9dbea', borderRadius: 11, borderWidth: 1, height: 46, justifyContent: 'center', width: 48 },
  primaryButton: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 12, justifyContent: 'center', marginTop: 8, minHeight: 46, paddingHorizontal: 16 },
  compactTranslate: { flex: 1, marginTop: 0 },
  primaryButtonPressed: { opacity: 0.78 },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  voiceStatus: { color: '#5147df', fontSize: 12, lineHeight: 17, marginTop: 6 },
  resultCard: { backgroundColor: '#eeecff', borderRadius: 14, marginTop: 10, padding: 11 },
  resultLabel: { color: '#5147df', fontSize: 12, fontWeight: '800' },
  resultText: { color: '#292344', fontSize: 17, lineHeight: 23, marginTop: 3 },
  resultActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8 },
  resultAction: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.72)', borderRadius: 10, flexDirection: 'row', gap: 5, minHeight: 38, paddingHorizontal: 9 },
  audioAction: { minWidth: 112 },
  resultActionText: { color: '#5147df', fontSize: 12, fontWeight: '700' },
  enrichment: { backgroundColor: '#f1faef', borderColor: '#d7ead9', borderRadius: 12, borderWidth: 1, marginTop: 10, padding: 9 },
  enrichmentToggle: { alignItems: 'center', flexDirection: 'row', minHeight: 40 },
  enrichmentToggleCopy: { flex: 1, marginLeft: 8 },
  enrichmentHint: { color: '#68728c', fontSize: 12, lineHeight: 17, marginTop: 2 },
  enrichmentDetails: { marginTop: 9 },
  hiddenDetails: { display: 'none' },
  detailHeading: { color: '#263b2b', fontSize: 13, fontWeight: '800', marginTop: 4 },
  enrichmentTitle: { color: '#342b76', fontSize: 13, fontWeight: '800' },
  usage: { color: '#4b4670', fontSize: 13, lineHeight: 18, marginTop: 4 },
  example: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.62)', borderRadius: 9, flexDirection: 'row', gap: 8, marginTop: 6, padding: 7 },
  exampleIndex: { alignItems: 'center', backgroundColor: '#e4f2e4', borderRadius: 14, color: '#2d8b57', fontSize: 12, fontWeight: '800', height: 28, lineHeight: 28, textAlign: 'center', width: 28 },
  exampleCopy: { flex: 1 },
  exampleText: { color: '#292344', fontSize: 13, lineHeight: 18 },
  exampleTranslation: { color: '#686182', fontSize: 12, lineHeight: 17, marginTop: 2 },
  error: { color: '#984b58', fontSize: 12, lineHeight: 18, marginTop: 9 },
  retry: { alignSelf: 'flex-start', minHeight: 38, justifyContent: 'center', paddingHorizontal: 2 },
  retryText: { color: '#5147df', fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.68 },
  recordingButton: { backgroundColor: '#fbe7eb', borderColor: '#d67b89' },
});

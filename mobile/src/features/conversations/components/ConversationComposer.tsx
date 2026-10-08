import { useThemedStyles } from '../../../theme/useThemedStyles';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_CONVERSATION_MESSAGE_LENGTH } from '../conversations.presentation';
import type { VoiceInteractionPhase } from '../audio/use-conversation-voice';

type ConversationComposerProps = {
  disabled: boolean;
  sending: boolean;
  value: string;
  onChangeText: (value: string) => void;
  onLayout: (height: number) => void;
  onInputFocus: () => void;
  onInputBlur: () => void;
  onSend: () => void;
  dictationPhase: VoiceInteractionPhase;
  dictationError: string | null;
  onCancelDictation: () => void;
  onStartDictation: () => void;
  onStopDictation: () => void;
  onClearDictationError: () => void;
};

export function ConversationComposer({ disabled, sending, value, onChangeText, onLayout, onInputFocus, onInputBlur, onSend, dictationPhase, dictationError,
  onCancelDictation, onStartDictation, onStopDictation, onClearDictationError }: ConversationComposerProps) {
  const styles = useThemedStyles(baseStyles);
  const recording = dictationPhase === 'recording';
  const transcribing = dictationPhase === 'transcribing';
  const canSend = !disabled && !sending && !recording && !transcribing && Boolean(value.trim());
  return (
    <View onLayout={(event) => onLayout(event.nativeEvent.layout.height)} style={styles.wrapper}>
      {dictationError ? <Pressable accessibilityRole="button" onPress={onClearDictationError} style={styles.dictationNotice}><Text style={styles.dictationError}>{dictationError} · Tocar para dispensar</Text></Pressable> : null}
      {transcribing ? <Text accessibilityLiveRegion="polite" style={styles.dictationNotice}>Transcrevendo sua fala...</Text> : null}
      <View style={styles.container}>
      <Pressable accessibilityRole="button" accessibilityLabel={recording ? 'Concluir gravação' : 'Gravar mensagem'}
        accessibilityState={{ busy: transcribing, disabled: !recording && (disabled || sending || transcribing) }}
        disabled={!recording && (disabled || sending || transcribing)} onPress={recording ? onStopDictation : onStartDictation}
        style={[styles.micButton, recording && styles.micRecording]}>
        {transcribing ? <ActivityIndicator color="#5b50f5" size="small" /> : <SymbolView accessible={false}
          name={recording ? { ios: 'stop.fill', android: 'stop', web: 'stop' } : { ios: 'mic.fill', android: 'mic', web: 'mic' }}
          size={20} tintColor={recording ? '#ffffff' : '#5b50f5'} />}
      </Pressable>
      {recording ? <Pressable accessibilityRole="button" accessibilityLabel="Cancelar gravação" onPress={onCancelDictation} style={styles.cancelButton}>
        <SymbolView accessible={false} name={{ ios: 'xmark', android: 'close', web: 'close' }} size={20} tintColor="#574d6b" />
      </Pressable> : null}
      <View style={styles.inputShell}>
        {recording ? <Text style={styles.recordingLabel}>Gravando sua fala...</Text> : <TextInput
          accessibilityLabel="Mensagem da conversa"
          editable={!disabled && !sending && !transcribing && !recording}
          maxLength={MAX_CONVERSATION_MESSAGE_LENGTH}
          multiline
          onChangeText={onChangeText}
          onFocus={onInputFocus}
          onBlur={onInputBlur}
          placeholder="Digite sua mensagem em inglês..."
          placeholderTextColor="#9296a6"
          returnKeyType="default"
          style={styles.input}
          value={value}
        />}
        {value.length > MAX_CONVERSATION_MESSAGE_LENGTH - 300 ? <Text style={styles.counter}>{value.length}/{MAX_CONVERSATION_MESSAGE_LENGTH}</Text> : null}
      </View>
      <Pressable
        accessibilityLabel={sending ? 'Enviando mensagem' : 'Enviar mensagem'}
        accessibilityRole="button"
        accessibilityState={{ busy: sending, disabled: !canSend }}
        disabled={!canSend}
        onPress={onSend}
        style={({ pressed }) => [styles.sendButton, !canSend && styles.sendButtonDisabled, pressed && canSend && styles.pressed]}
      >
        {sending ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <SymbolView accessible={false} name={{ ios: 'arrow.up', android: 'arrow_upward', web: 'arrow_upward' }} size={20} tintColor="#ffffff" />
        )}
      </Pressable>
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  wrapper: { backgroundColor: '#ffffff', borderTopColor: '#e7e7f0', borderTopWidth: 1 },
  container: { alignItems: 'flex-end', flexDirection: 'row', gap: 9, paddingHorizontal: 12, paddingVertical: 9 },
  micButton: { alignItems: 'center', backgroundColor: '#f1efff', borderRadius: 22, height: 44, justifyContent: 'center', marginBottom: 2, width: 44 },
  micRecording: { backgroundColor: '#b84a58' },
  recordingLabel: { color: '#8f3c42', fontSize: 11, fontWeight: '700', paddingTop: 7 },
  cancelButton: { alignItems: 'center', backgroundColor: '#f4f2fa', borderColor: '#d8d2e7', borderRadius: 22, borderWidth: 1, height: 44, justifyContent: 'center', marginBottom: 2, width: 44 },
  dictationNotice: { color: '#6859b9', fontSize: 11, paddingHorizontal: 15, paddingTop: 6 },
  dictationError: { color: '#9f3f45', fontSize: 11 },
  inputShell: { backgroundColor: '#f4f5fa', borderColor: '#dedfe9', borderRadius: 17, borderWidth: 1, flex: 1, minHeight: 48, paddingBottom: 5, paddingHorizontal: 13, paddingTop: 7 },
  input: { color: '#242136', fontSize: 14, lineHeight: 19, maxHeight: 104, minHeight: 25, padding: 0, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', color: '#999dad', fontSize: 8.5, marginTop: 2 },
  sendButton: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  sendButtonDisabled: { backgroundColor: '#aaa5de' },
  pressed: { opacity: 0.74 },
});

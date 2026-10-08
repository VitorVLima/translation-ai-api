import { useThemedStyles } from '../../../theme/useThemedStyles';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { VoiceInteractionPhase } from '../audio/use-conversation-voice';

type VoiceConversationControlsProps = {
  assistantName: string;
  disabled: boolean;
  error: string | null;
  phase: VoiceInteractionPhase;
  transcript: string | null;
  onLayout: () => void;
  onCancelRecording: () => void;
  onClearError: () => void;
  onStartRecording: () => void;
  onStopPlayback: () => void;
  onStopRecording: () => void;
};

export function VoiceConversationControls({
  assistantName,
  disabled,
  error,
  phase,
  transcript,
  onLayout,
  onCancelRecording,
  onClearError,
  onStartRecording,
  onStopPlayback,
  onStopRecording,
}: VoiceConversationControlsProps) {
  const styles = useThemedStyles(baseStyles);
  const recording = phase === 'recording';
  const speaking = phase === 'speaking';
  const busy = phase === 'transcribing' || phase === 'sending' || phase === 'waitingForAssistant';
  const canRecord = !disabled && !busy && !speaking && !recording;
  const status = getVoiceStatus(phase, assistantName);

  return (
    <View onLayout={onLayout} style={styles.container}>
      {transcript ? <View style={styles.transcript}><Text style={styles.transcriptLabel}>Você disse</Text><Text numberOfLines={3} style={styles.transcriptText}>{transcript}</Text></View> : null}
      {error ? <View accessibilityLiveRegion="polite" style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel="Tentar falar novamente" onPress={onClearError}><Text style={styles.retryText}>Tentar novamente</Text></Pressable></View> : null}
      <View style={styles.controls}>
        {recording ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Concluir e enviar gravação" onPress={onStopRecording} style={({ pressed }) => [styles.microphoneButton, styles.microphoneRecording, pressed && styles.pressed]}>
            <SymbolView accessible={false} name={{ ios: 'stop.fill', android: 'stop', web: 'stop' }} size={25} tintColor="#ffffff" />
          </Pressable>
        ) : speaking ? (
          <Pressable accessibilityLabel="Parar áudio do assistente" accessibilityRole="button" onPress={onStopPlayback} style={({ pressed }) => [styles.stopButton, pressed && styles.pressed]}>
            <SymbolView accessible={false} name={{ ios: 'stop.fill', android: 'stop', web: 'stop' }} size={22} tintColor="#ffffff" />
          </Pressable>
        ) : (
          <Pressable
            accessibilityLabel={busy ? status : 'Começar gravação'}
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: disabled || busy || speaking }}
            disabled={disabled || busy || speaking}
            onPress={onStartRecording}
            style={({ pressed }) => [styles.microphoneButton, (disabled || busy || speaking) && styles.microphoneDisabled, pressed && canRecord && styles.pressed]}
          >
            {busy ? <ActivityIndicator color="#ffffff" size="small" /> : <SymbolView accessible={false} name={{ ios: 'mic.fill', android: 'mic', web: 'mic' }} size={29} tintColor="#ffffff" />}
          </Pressable>
        )}
        {recording ? <Pressable accessibilityRole="button" accessibilityLabel="Cancelar gravação" onPress={onCancelRecording} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
          <SymbolView accessible={false} name={{ ios: 'xmark', android: 'close', web: 'close' }} size={21} tintColor="#574d6b" />
        </Pressable> : null}
        <View style={styles.statusCopy}>
          <Text style={styles.statusTitle}>{status}</Text>
          <Text style={styles.statusDescription}>{getVoiceDescription(phase, assistantName)}</Text>
        </View>
      </View>
    </View>
  );
}

function getVoiceStatus(phase: VoiceInteractionPhase, assistantName: string): string {
  if (phase === 'recording') return 'Ouvindo...';
  if (phase === 'transcribing') return 'Processando sua fala...';
  if (phase === 'sending') return 'Enviando sua mensagem...';
  if (phase === 'waitingForAssistant') return `${assistantName} está respondendo...`;
  if (phase === 'speaking') return `${assistantName} está falando...`;
  return 'Toque para falar';
}

function getVoiceDescription(phase: VoiceInteractionPhase, assistantName: string): string {
  if (phase === 'recording') return 'Conclua para enviar ou cancele para descartar.';
  if (phase === 'transcribing') return 'Estamos identificando o que você disse.';
  if (phase === 'sending' || phase === 'waitingForAssistant') return 'Aguarde a resposta da IA.';
  if (phase === 'speaking') return `Você pode parar o áudio de ${assistantName}.`;
  return 'Fale em inglês quando estiver pronto.';
}

const baseStyles = StyleSheet.create({
  container: { backgroundColor: '#ffffff', borderTopColor: '#e7e7f0', borderTopWidth: 1, paddingHorizontal: 15, paddingVertical: 12 },
  controls: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 66 },
  microphoneButton: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 31, height: 62, justifyContent: 'center', width: 62 },
  microphoneRecording: { backgroundColor: '#b84a58' },
  microphoneDisabled: { backgroundColor: '#aaa5de' },
  cancelButton: { alignItems: 'center', backgroundColor: '#f4f2fa', borderColor: '#d8d2e7', borderRadius: 24, borderWidth: 1, height: 48, justifyContent: 'center', width: 48 },
  stopButton: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 31, height: 62, justifyContent: 'center', width: 62 },
  statusCopy: { flex: 1 },
  statusTitle: { color: '#292540', fontSize: 13.5, fontWeight: '700' },
  statusDescription: { color: '#74798d', fontSize: 10.5, lineHeight: 15, marginTop: 3 },
  transcript: { backgroundColor: '#f3f1ff', borderColor: '#dfdafd', borderRadius: 12, borderWidth: 1, marginBottom: 9, paddingHorizontal: 11, paddingVertical: 8 },
  transcriptLabel: { color: '#5b50f5', fontSize: 9.5, fontWeight: '800', textTransform: 'uppercase' },
  transcriptText: { color: '#38334f', fontSize: 12, lineHeight: 17, marginTop: 3 },
  error: { backgroundColor: '#fff1f1', borderColor: '#f0cdcf', borderRadius: 12, borderWidth: 1, marginBottom: 9, paddingHorizontal: 11, paddingVertical: 8 },
  errorText: { color: '#8f3c42', fontSize: 11, lineHeight: 16 },
  retryText: { color: '#6b42d8', fontSize: 11.5, fontWeight: '700', marginTop: 5 },
  pressed: { opacity: 0.74 },
});

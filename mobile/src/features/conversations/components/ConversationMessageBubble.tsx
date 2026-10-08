import { useThemedStyles } from '../../../theme/useThemedStyles';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ConversationMessage } from '../conversations.types';

type Props = {
  message: ConversationMessage;
  deliveryState?: 'sending' | 'unconfirmed' | 'syncing';
  assistantName: string;
  correction?: string | null;
  correctionExpanded?: boolean;
  translation?: string;
  translationLoading?: boolean;
  translationError?: boolean;
  speechLoading?: boolean;
  speaking?: boolean;
  speechError?: boolean;
  speechDisabled?: boolean;
  onTranslate?: () => void;
  onSpeech?: () => void;
  onToggleCorrection?: () => void;
};

export function ConversationMessageBubble({ message, assistantName, correction, translation, deliveryState,
  correctionExpanded = false, translationLoading, translationError, speechLoading, speaking, speechError, speechDisabled,
  onTranslate, onSpeech, onToggleCorrection }: Props) {
  const styles = useThemedStyles(baseStyles);
  const fromUser = message.role === 'USER';
  const hasCorrection = fromUser && Boolean(correction?.trim() && correction.trim() !== message.content.trim());
  return <View style={[styles.row, fromUser ? styles.userRow : styles.assistantRow]}>
    <View style={[styles.bubble, fromUser ? styles.userBubble : styles.assistantBubble]}>
      {!fromUser ? <Text style={styles.author}>{assistantName}</Text> : null}
      <Text style={[styles.content, fromUser && styles.userContent]}>{message.content}</Text>
      {fromUser && deliveryState ? <Text accessibilityLiveRegion="polite" style={styles.deliveryState}>
        {deliveryState === 'sending' ? 'Aguardando resposta...' : deliveryState === 'syncing' ? 'Aguardando histórico...' : 'Envio não confirmado'}
      </Text> : null}
      {hasCorrection ? <>
        <Pressable accessibilityRole="button" accessibilityLabel={correctionExpanded ? 'Ocultar correção' : 'Ver correção'}
          accessibilityState={{ expanded: correctionExpanded }} onPress={onToggleCorrection} style={styles.correctionToggle}>
          <SymbolView accessible={false} name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }} size={14} tintColor="#fff1ba" />
          <Text style={styles.correctionToggleText}>{correctionExpanded ? 'Ocultar correção' : 'Ver correção'}</Text>
        </Pressable>
        {correctionExpanded ? (
        <View style={styles.correction}>
          <Text style={styles.correctionLabel}>Sugestão de correção</Text>
          <Text style={styles.correctionText}>{correction}</Text>
        </View>
        ) : null}
      </> : null}
      {!fromUser ? <>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={speaking ? 'Parar áudio' : 'Ouvir mensagem'}
            accessibilityState={{ busy: speechLoading, disabled: speechDisabled }} disabled={speechDisabled} onPress={onSpeech} style={styles.action}>
            {speechLoading ? <ActivityIndicator color="#5b50f5" size="small" /> : <SymbolView accessible={false}
              name={speaking ? { ios: 'stop.fill', android: 'stop', web: 'stop' } : { ios: 'speaker.wave.2.fill', android: 'volume_up', web: 'volume_up' }}
              size={17} tintColor="#5b50f5" />}
            <Text style={styles.actionText}>{speaking ? 'Parar' : 'Ouvir'}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={translation ? 'Ocultar tradução' : 'Traduzir mensagem'}
            accessibilityState={{ busy: translationLoading }} onPress={onTranslate} style={styles.action}>
            {translationLoading ? <ActivityIndicator color="#5b50f5" size="small" /> : <SymbolView accessible={false}
              name={{ ios: 'character.book.closed', android: 'translate', web: 'translate' }} size={17} tintColor="#5b50f5" />}
            <Text style={styles.actionText}>{translation ? 'Ocultar' : 'Traduzir'}</Text>
          </Pressable>
        </View>
        {translation ? <View style={styles.translation}><Text style={styles.translationLabel}>Tradução</Text><Text style={styles.translationText}>{translation}</Text></View> : null}
        {translationError ? <Text accessibilityLiveRegion="polite" style={styles.error}>Não foi possível traduzir. Tente novamente.</Text> : null}
        {speechError ? <Text accessibilityLiveRegion="polite" style={styles.error}>Não foi possível reproduzir o áudio.</Text> : null}
      </> : null}
    </View>
  </View>;
}

const baseStyles = StyleSheet.create({
  row: { marginVertical: 6, width: '100%' },
  assistantRow: { alignItems: 'flex-start' },
  userRow: { alignItems: 'flex-end' },
  bubble: { borderRadius: 18, maxWidth: '88%', paddingHorizontal: 14, paddingVertical: 11 },
  assistantBubble: { backgroundColor: '#ffffff', borderColor: '#e7e3f1', borderTopLeftRadius: 5, borderWidth: 1 },
  userBubble: { backgroundColor: '#5b50f5', borderTopRightRadius: 5 },
  author: { color: '#5b50f5', fontSize: 11, fontWeight: '700', marginBottom: 5 },
  content: { color: '#262337', fontSize: 14, lineHeight: 21 },
  userContent: { color: '#ffffff' },
  deliveryState: { color: '#e9e5ff', fontSize: 10.5, marginTop: 5 },
  actions: { borderTopColor: '#f0edf6', borderTopWidth: 1, flexDirection: 'row', gap: 15, marginTop: 10, paddingTop: 8 },
  action: { alignItems: 'center', flexDirection: 'row', gap: 5, minHeight: 32, paddingRight: 4 },
  actionText: { color: '#5b50f5', fontSize: 11, fontWeight: '700' },
  correctionToggle: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 5, marginTop: 9, minHeight: 28 },
  correctionToggleText: { color: '#fff1ba', fontSize: 11, fontWeight: '700' },
  correction: { backgroundColor: '#f5f3ff', borderRadius: 10, marginTop: 4, padding: 9 },
  correctionLabel: { color: '#5b50f5', fontSize: 10, fontWeight: '800' },
  correctionText: { color: '#4e4b61', fontSize: 12, lineHeight: 17, marginTop: 3 },
  translation: { backgroundColor: '#f5f3ff', borderRadius: 10, marginTop: 6, padding: 9 },
  translationLabel: { color: '#6b55bb', fontSize: 10, fontWeight: '700' },
  translationText: { color: '#37334c', fontSize: 12, lineHeight: 18, marginTop: 3 },
  error: { color: '#9f3f45', fontSize: 11, marginTop: 6 },
});

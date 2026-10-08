import { useThemedStyles } from '../../../theme/useThemedStyles';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { getConversationEvaluationProgress, getEvaluationProgressCopy } from '../conversations.presentation';
import type { ConversationMessage } from '../conversations.types';

type ConversationProgressProps = {
  messages: ConversationMessage[];
  isCompleting: boolean;
  disabled?: boolean;
  onComplete: () => void;
};

export function ConversationProgress({ messages, isCompleting, disabled = false, onComplete }: ConversationProgressProps) {
  const styles = useThemedStyles(baseStyles);
  const progress = getConversationEvaluationProgress(messages);
  const width = `${(progress.displayCurrent / progress.required) * 100}%` as `${number}%`;
  const copy = getEvaluationProgressCopy(progress.ready);

  return (
    <View accessibilityLabel={copy.accessibilityLabel} style={[styles.card, progress.ready && styles.readyCard]}>
      <View style={styles.headingRow}>
        <Text style={styles.title}>Progresso para avaliação</Text>
      </View>
      <View style={[styles.progressRow, progress.ready && styles.readyProgressRow]}>
        <View accessibilityElementsHidden accessibilityRole="none" importantForAccessibility="no-hide-descendants" style={[styles.track, progress.ready && styles.readyTrack]}>
          <View style={[styles.fill, progress.ready && styles.readyFill, { width }]} />
        </View>
        {progress.ready ? <Pressable
          accessibilityLabel={isCompleting ? 'Avaliando sua conversa' : 'Finalizar conversa'}
          accessibilityRole="button"
          accessibilityState={{ busy: isCompleting, disabled: isCompleting || disabled }}
          disabled={isCompleting || disabled}
          hitSlop={5}
          onPress={onComplete}
          style={({ pressed }) => [styles.action, pressed && !isCompleting && styles.pressed]}
        >
          {isCompleting ? <ActivityIndicator color="#ffffff" size="small" /> : <SymbolView accessible={false} name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={16} tintColor="#ffffff" />}
          <Text style={styles.actionText}>Finalizar</Text>
        </Pressable> : null}
      </View>
      {!progress.ready ? <Text style={styles.detail}>{copy.detail}</Text> : null}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  card: { backgroundColor: '#f1efff', borderBottomColor: '#ded8ff', borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  readyCard: { backgroundColor: '#eef8f2', borderBottomColor: '#cfe8d9', paddingVertical: 6 },
  headingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  title: { color: '#383354', fontSize: 11.5, fontWeight: '700' },
  progressRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 7 },
  readyProgressRow: { marginTop: 4 },
  track: { backgroundColor: '#ddd8f7', borderRadius: 4, flex: 1, height: 6, minWidth: 40, overflow: 'hidden' },
  readyTrack: { backgroundColor: '#cfe8d9' },
  fill: { backgroundColor: '#5b50f5', borderRadius: 4, height: '100%' },
  readyFill: { backgroundColor: '#3d805c' },
  detail: { color: '#67617e', fontSize: 10.5, lineHeight: 14, marginTop: 6 },
  action: { alignItems: 'center', backgroundColor: '#3d805c', borderRadius: 9, flexDirection: 'row', gap: 5, justifyContent: 'center', minHeight: 34, paddingHorizontal: 10 },
  actionText: { color: '#ffffff', fontSize: 11.5, fontWeight: '800' },
  pressed: { opacity: 0.68 },
});

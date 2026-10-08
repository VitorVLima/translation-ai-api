import { useThemedStyles } from '../../../theme/useThemedStyles';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { getReadingDifficultyLabel, getReadingStatusLabel, getReadingTopicLabel, isReadingClosedWithoutResult } from '../reading.presentation';
import type { ReadingActivitySummary } from '../reading.types';

type Props = {
  activity: ReadingActivitySummary;
  onPress: () => void;
  onDelete?: () => void;
  deleting?: boolean;
  prominent?: boolean;
};

export function ReadingActivityCard({ activity, onPress, onDelete, deleting = false, prominent = false }: Props) {
  const styles = useThemedStyles(baseStyles);
  const completed = activity.status !== 'IN_PROGRESS';
  const withoutResult = isReadingClosedWithoutResult(activity);
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityLabel={`${withoutResult ? 'Abrir leitura sem resultado' : completed ? 'Abrir leitura concluída' : 'Continuar leitura'}: ${activity.title}`}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.card, prominent && styles.prominent, pressed && styles.pressed]}
      >
        <View style={[styles.icon, completed ? styles.completedIcon : styles.activeIcon]}>
          <SymbolView accessible={false} name={{ ios: completed ? 'checkmark.circle.fill' : 'book.closed.fill', android: completed ? 'task_alt' : 'menu_book', web: completed ? 'task_alt' : 'menu_book' }} size={20} tintColor={completed ? '#32836b' : '#5b50f5'} />
        </View>
        <View style={styles.copy}>
          <Text numberOfLines={2} style={styles.title}>{activity.title}</Text>
          <Text style={styles.meta}>{getReadingTopicLabel(activity.topic)} · {getReadingDifficultyLabel(activity.difficulty)}</Text>
          <Text style={styles.status}>{withoutResult ? 'Sem resultado' : getReadingStatusLabel(activity.status)}{completed && activity.comprehensionPercentage !== null ? ` · ${activity.comprehensionPercentage}%` : ''}</Text>
        </View>
        <SymbolView accessible={false} name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={20} tintColor="#8189a1" />
      </Pressable>
      {!completed && onDelete ? (
        <Pressable
          accessibilityLabel="Excluir leitura em andamento"
          accessibilityRole="button"
          accessibilityState={{ disabled: deleting }}
          disabled={deleting}
          onPress={onDelete}
          style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
        >
          <SymbolView accessible={false} name={{ ios: 'trash', android: 'delete_outline', web: 'delete_outline' }} size={19} tintColor="#9a5361" />
        </Pressable>
      ) : null}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  card: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e7e9f2', borderRadius: 16, borderWidth: 1, flex: 1, flexDirection: 'row', minHeight: 78, paddingHorizontal: 12, paddingVertical: 10 },
  prominent: { borderColor: '#d9d5ff', borderWidth: 1.5 },
  icon: { alignItems: 'center', borderRadius: 13, height: 42, justifyContent: 'center', width: 42 },
  activeIcon: { backgroundColor: '#eeecff' },
  completedIcon: { backgroundColor: '#e8f7f1' },
  copy: { flex: 1, marginHorizontal: 11, minWidth: 0 },
  title: { color: '#171528', flex: 1, fontSize: 15, fontWeight: '800', lineHeight: 20 },
  meta: { color: '#59647e', fontSize: 12, marginTop: 3 },
  status: { color: '#5b50f5', fontSize: 12, fontWeight: '700', marginTop: 3 },
  deleteButton: { alignItems: 'center', backgroundColor: '#fff5f6', borderColor: '#f0d9dd', borderRadius: 14, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  pressed: { opacity: 0.76 },
});

import { useThemedStyles } from '../../../theme/useThemedStyles';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ConversationDifficultyOption } from '../conversations.presentation';

type ConversationDifficultyCardProps = {
  icon: SymbolViewProps['name'];
  option: ConversationDifficultyOption;
  recommended: boolean;
  selected: boolean;
  onPress: () => void;
};

export function ConversationDifficultyCard({ icon, option, recommended, selected, onPress }: ConversationDifficultyCardProps) {
  const styles = useThemedStyles(baseStyles);
  return (
    <Pressable
      accessibilityLabel={`${option.label}, ${option.cefr}. ${option.description}${recommended ? ' Recomendado para você.' : ''}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && styles.pressed]}
    >
      <View style={[styles.icon, selected && styles.iconSelected]}>
        <SymbolView accessible={false} name={icon} size={20} tintColor={selected ? '#ffffff' : '#5b50f5'} />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{option.label}</Text>
          <Text style={styles.cefr}>{option.cefr}</Text>
          {recommended ? <Text style={styles.recommended}>Para você</Text> : null}
        </View>
        <Text style={styles.description}>{option.description}</Text>
      </View>
      {selected ? (
        <View style={styles.check}>
          <SymbolView accessible={false} name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={13} tintColor="#ffffff" />
        </View>
      ) : null}
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  card: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e1e3ed', borderRadius: 15, borderWidth: 1, flexDirection: 'row', gap: 11, minHeight: 82, padding: 12 },
  cardSelected: { backgroundColor: '#f4f2ff', borderColor: '#5b50f5', borderWidth: 2, padding: 11 },
  pressed: { opacity: 0.74 },
  icon: { alignItems: 'center', backgroundColor: '#ebe8ff', borderRadius: 19, height: 38, justifyContent: 'center', width: 38 },
  iconSelected: { backgroundColor: '#5b50f5' },
  copy: { flex: 1 },
  titleRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingRight: 22 },
  title: { color: '#171528', fontSize: 14, fontWeight: '700' },
  cefr: { color: '#74798d', fontSize: 11, fontWeight: '600' },
  recommended: { backgroundColor: '#ebe8ff', borderRadius: 7, color: '#5147df', fontSize: 9, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 2 },
  description: { color: '#74798d', fontSize: 11, lineHeight: 15, marginTop: 4 },
  check: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 9, height: 18, justifyContent: 'center', position: 'absolute', right: 11, top: 11, width: 18 },
});

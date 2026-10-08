import { useThemedStyles } from '../../../theme/useThemedStyles';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ConversationModeOption } from '../conversations.presentation';

type ConversationModeCardProps = {
  icon: SymbolViewProps['name'];
  option: ConversationModeOption;
  selected: boolean;
  onPress: () => void;
};

export function ConversationModeCard({ icon, option, selected, onPress }: ConversationModeCardProps) {
  const styles = useThemedStyles(baseStyles);
  return (
    <Pressable
      accessibilityLabel={`${option.label}. ${option.title}. ${option.description}${option.available ? '' : ' Em breve.'}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: !option.available, selected }}
      disabled={!option.available}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        !option.available && styles.cardDisabled,
        pressed && option.available && styles.pressed,
      ]}
    >
      {selected ? (
        <View style={styles.check}>
          <SymbolView
            accessible={false}
            name={{ ios: 'checkmark', android: 'check', web: 'check' }}
            size={13}
            tintColor="#ffffff"
          />
        </View>
      ) : null}
      {!option.available ? <Text style={styles.comingSoon}>EM BREVE</Text> : null}
      <View style={[styles.icon, selected && styles.iconSelected]}>
        <SymbolView
          accessible={false}
          name={icon}
          size={24}
          tintColor={selected ? '#ffffff' : '#777d91'}
        />
      </View>
      <View style={styles.copy}>
        <Text style={styles.label}>{option.label}</Text>
        <Text style={styles.title}>{option.title}.</Text>
        <Text style={styles.description}>{option.description}</Text>
      </View>
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e1e3ed',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 90,
    padding: 12,
    position: 'relative',
  },
  cardSelected: { backgroundColor: '#f4f2ff', borderColor: '#5b50f5', borderWidth: 2, padding: 11 },
  cardDisabled: { backgroundColor: '#f3f4f7', borderColor: '#e1e3e9' },
  pressed: { opacity: 0.74 },
  check: {
    alignItems: 'center',
    backgroundColor: '#5b50f5',
    borderRadius: 9,
    height: 18,
    justifyContent: 'center',
    position: 'absolute',
    right: 9,
    top: 9,
    width: 18,
  },
  comingSoon: {
    backgroundColor: '#e5e7ed',
    borderRadius: 7,
    color: '#74798d',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.35,
    paddingHorizontal: 6,
    paddingVertical: 4,
    position: 'absolute',
    right: 8,
    top: 8,
  },
  icon: {
    alignItems: 'center',
    backgroundColor: '#e9e8f2',
    borderRadius: 21,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  iconSelected: { backgroundColor: '#5b50f5' },
  copy: { flex: 1, paddingRight: 22 },
  label: { color: '#171528', fontSize: 14, fontWeight: '700' },
  title: { color: '#565c70', fontSize: 11, fontWeight: '600', lineHeight: 15, marginTop: 2 },
  description: { color: '#858a9c', fontSize: 10.5, lineHeight: 14, marginTop: 2 },
});

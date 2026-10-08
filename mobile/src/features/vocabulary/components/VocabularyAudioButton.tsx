import { useThemedStyles } from '../../../theme/useThemedStyles';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

type VocabularyAudioButtonProps = {
  accessibilityLabel: string;
  label?: string;
  loading: boolean;
  onPress: () => void;
  playing: boolean;
};

export function VocabularyAudioButton({ accessibilityLabel, label, loading, onPress, playing }: VocabularyAudioButtonProps) {
  const styles = useThemedStyles(baseStyles);
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy: loading }}
      disabled={loading}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [styles.button, label && styles.labeledButton, playing && styles.playing, pressed && styles.pressed]}
    >
      {loading ? <ActivityIndicator color="#5b50f5" size="small" /> : (
        <SymbolView
          accessible={false}
          name={playing
            ? { ios: 'stop.fill', android: 'stop', web: 'stop' }
            : { ios: 'speaker.wave.2.fill', android: 'volume_up', web: 'volume_up' }}
          size={19}
          tintColor="#5b50f5"
        />
      )}
      {label ? <Text style={styles.label}>{loading ? 'Carregando...' : label}</Text> : null}
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  button: { alignItems: 'center', backgroundColor: '#efedff', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  labeledButton: { flexDirection: 'row', gap: 7, height: 40, paddingHorizontal: 11, width: undefined },
  label: { color: '#5147df', fontSize: 12, fontWeight: '700' },
  playing: { backgroundColor: '#dcd8ff' },
  pressed: { opacity: 0.7 },
});

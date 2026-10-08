import { useThemedStyles } from '../../../theme/useThemedStyles';
import { StyleSheet, Text, TextInput, View } from 'react-native';

type VerificationCodeInputProps = {
  label: string;
  accessibilityLabel: string;
  value: string;
  onChangeText: (value: string) => void;
  editable?: boolean;
};

export function VerificationCodeInput({ label, accessibilityLabel, value, onChangeText, editable = true }: VerificationCodeInputProps) {
  const styles = useThemedStyles(baseStyles);
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputArea}>
        <View pointerEvents="none" style={styles.cells}>
          {Array.from({ length: 6 }, (_, index) => (
            <View key={index} style={[styles.cell, value.length === index && styles.cellActive]}>
              <Text style={styles.cellText}>{value[index] ?? ''}</Text>
            </View>
          ))}
        </View>
        <TextInput
          accessibilityLabel={accessibilityLabel}
          autoCapitalize="none"
          autoComplete="one-time-code"
          autoCorrect={false}
          editable={editable}
          keyboardType="number-pad"
          maxLength={6}
          onChangeText={(text) => onChangeText(text.replace(/\D/g, '').slice(0, 6))}
          style={styles.input}
          textContentType="oneTimeCode"
          value={value}
        />
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  section: { marginTop: 28 },
  label: { color: '#211d39', fontSize: 13, fontWeight: '700', marginBottom: 9, textAlign: 'center' },
  inputArea: { height: 52, position: 'relative' },
  cells: { flexDirection: 'row', gap: 6, height: '100%', justifyContent: 'center' },
  cell: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#dfe3ef', borderRadius: 10, borderWidth: 1, flex: 1, height: 50, justifyContent: 'center', maxWidth: 42 },
  cellActive: { borderColor: '#5b50f5', borderWidth: 1.5 },
  cellText: { color: '#211d39', fontSize: 20, fontWeight: '700' },
  input: { bottom: 0, color: 'transparent', left: 0, opacity: 0.01, position: 'absolute', right: 0, top: 0 },
});

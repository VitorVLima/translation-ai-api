import { useThemedStyles } from '../../../theme/useThemedStyles';
import { StyleSheet, Text, View } from 'react-native';
import { getPasswordRequirements } from '../password-rules';

function Requirement({ label, satisfied }: { label: string; satisfied: boolean }) {
  const styles = useThemedStyles(baseStyles);
  return <Text style={[styles.requirement, satisfied && styles.satisfied]}>{satisfied ? '✓' : '○'} {label}</Text>;
}

export function PasswordRequirements({ password }: { password: string }) {
  const styles = useThemedStyles(baseStyles);
  const requirements = getPasswordRequirements(password);
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sua senha deve conter:</Text>
      <Requirement label="Pelo menos 6 caracteres" satisfied={requirements.min} />
      <Requirement label="No máximo 100 caracteres" satisfied={requirements.max} />
      <Requirement label="Até 72 bytes em UTF-8" satisfied={requirements.bytes} />
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { backgroundColor: '#f1f2fc', borderRadius: 13, marginTop: 2, paddingHorizontal: 13, paddingVertical: 9 },
  title: { color: '#45436d', fontSize: 12.5, fontWeight: '700', marginBottom: 2 },
  requirement: { color: '#686681', fontSize: 12.5, lineHeight: 20 },
  satisfied: { color: '#338b64' },
});

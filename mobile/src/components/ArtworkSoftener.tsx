import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

/** Softens the white background baked into decorative artwork in dark mode. */
export function ArtworkSoftener() {
  const { resolved } = useTheme();
  if (resolved !== 'dark') return null;
  return <View pointerEvents="none" style={styles.overlay} />;
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(24, 28, 54, 0.14)' },
});

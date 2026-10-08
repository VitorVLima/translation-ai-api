import { useThemedStyles } from '../theme/useThemedStyles';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from './ScreenHeader';

type PageLoadingProps = {
  label?: string;
  onBack?: () => void;
  title?: string;
};

export function PageLoading({ label = 'Carregando...', onBack, title }: PageLoadingProps) {
  const styles = useThemedStyles(baseStyles);
  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        {title && onBack ? <View style={styles.header}><ScreenHeader onBack={onBack} title={title} /></View> : null}
        <View accessibilityLabel={label} accessibilityLiveRegion="polite" accessibilityRole="progressbar" style={styles.center}>
          <ActivityIndicator color="#5b50f5" size="large" />
          <Text style={styles.label}>{label}</Text>
        </View>
      </SafeAreaView>
      <StatusBar style="auto" />
    </View>
  );
}

const baseStyles = StyleSheet.create({
  screen: { backgroundColor: '#f8f9ff', flex: 1 },
  safeArea: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 7 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 },
  label: { color: '#686e82', fontSize: 13, marginTop: 13, textAlign: 'center' },
});

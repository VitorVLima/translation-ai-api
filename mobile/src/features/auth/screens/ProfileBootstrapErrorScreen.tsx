import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../../../i18n';
import { logoutSession } from '../auth.session';

export function ProfileBootstrapErrorScreen({ onRetry }: { onRetry: () => void }) {
  const styles = useThemedStyles(baseStyles);
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const logout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try { await logoutSession(); } finally { setSigningOut(false); }
  };
  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>{t('setup.profileLoadError')}</Text>
        <Text style={styles.description}>{t('setup.profileLoadHint')}</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ busy: loading }} disabled={loading} onPress={() => { setLoading(true); onRetry(); }} style={styles.primary}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{t('common.retry')}</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" disabled={signingOut} onPress={() => void logout()} style={styles.secondary}>
          <Text style={styles.secondaryText}>{signingOut ? '…' : t('setup.logout')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const baseStyles = StyleSheet.create({
  screen: { backgroundColor: '#f8f9ff', flex: 1 }, content: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 },
  title: { color: '#17143b', fontSize: 21, fontWeight: '800', textAlign: 'center' }, description: { color: '#62688c', fontSize: 15, lineHeight: 22, marginTop: 10, textAlign: 'center' },
  primary: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 13, justifyContent: 'center', marginTop: 22, minHeight: 50, minWidth: 160, paddingHorizontal: 20 }, primaryText: { color: '#fff', fontWeight: '700' },
  secondary: { alignItems: 'center', justifyContent: 'center', marginTop: 10, minHeight: 48, paddingHorizontal: 16 }, secondaryText: { color: '#5b50f5', fontWeight: '600' },
});

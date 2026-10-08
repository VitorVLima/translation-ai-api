import { useThemedStyles } from '../../../theme/useThemedStyles';
import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../../../i18n';

export function HomeEditorialCard() {
  const styles = useThemedStyles(baseStyles);
  const { t } = useI18n();
  return (
    <View accessibilityLabel={t('home.editorialTitle')} style={styles.card}>
      <View style={styles.iconCircle}>
        <SymbolView accessible={false} name={{ ios: 'sparkles', android: 'auto_awesome', web: 'auto_awesome' }} size={22} tintColor="#5b50f5" />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{t('home.editorialTitle')}</Text>
        <Text style={styles.subtitle}>{t('home.editorialSubtitle')}</Text>
      </View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  card: { alignItems: 'center', backgroundColor: '#efedff', borderRadius: 15, flexDirection: 'row', marginTop: 18, paddingHorizontal: 14, paddingVertical: 13 },
  iconCircle: { alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 20, height: 40, justifyContent: 'center', marginRight: 11, width: 40 },
  copy: { flex: 1, minWidth: 0 },
  title: { color: '#29225d', fontSize: 13, fontWeight: '800', lineHeight: 18 },
  subtitle: { color: '#625d83', fontSize: 11.5, lineHeight: 16, marginTop: 2 },
});

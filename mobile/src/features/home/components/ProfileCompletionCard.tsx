import { useThemedStyles } from '../../../theme/useThemedStyles';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../../../i18n';

type ProfileCompletionCardProps = {
  onPress: () => void;
};

export function ProfileCompletionCard({ onPress }: ProfileCompletionCardProps) {
  const styles = useThemedStyles(baseStyles);
  const { t } = useI18n();
  return (
    <View accessibilityRole="summary" style={styles.card}>
      <View style={styles.iconCircle}>
        <SymbolView
          accessible={false}
          name={{ ios: 'person.crop.circle.badge.plus', android: 'manage_accounts', web: 'manage_accounts' }}
          size={24}
          tintColor="#5b50f5"
        />
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{t('home.completeProfile')}</Text>
        <Text style={styles.description}>{t('home.completeProfileDescription')}</Text>
      </View>
      <Pressable
        accessibilityLabel={t('home.completeProfile')}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onPress}
        style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
      >
        <Text style={styles.actionText}>{t('home.completeProfileAction')} →</Text>
      </Pressable>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: '#fff8ea',
    borderColor: '#f2dfb4',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 16,
    minHeight: 78,
    padding: 13,
  },
  iconCircle: {
    alignItems: 'center',
    backgroundColor: '#ece9ff',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  content: {
    flex: 1,
    marginHorizontal: 11,
  },
  title: {
    color: '#171528',
    fontSize: 13.5,
    fontWeight: '700',
  },
  description: {
    color: '#6f7487',
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 3,
  },
  action: {
    alignItems: 'center',
    borderColor: '#5b50f5',
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 10,
  },
  actionPressed: {
    backgroundColor: '#ece9ff',
  },
  actionText: {
    color: '#5147df',
    fontSize: 11.5,
    fontWeight: '700',
  },
});

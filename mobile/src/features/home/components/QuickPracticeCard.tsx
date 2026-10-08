import { useThemedStyles } from '../../../theme/useThemedStyles';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../../../i18n';

type QuickPracticeCardProps = {
  label: string;
  description?: string;
  icon: SymbolViewProps['name'];
  iconColor: string;
  iconBackgroundColor: string;
  onPress?: () => void;
};

export function QuickPracticeCard({
  label,
  description,
  icon,
  iconColor,
  iconBackgroundColor,
  onPress,
}: QuickPracticeCardProps) {
  const styles = useThemedStyles(baseStyles);
  const { t } = useI18n();
  const enabled = Boolean(onPress);
  return (
    <Pressable
      accessibilityLabel={enabled ? label : `${label}. ${t('home.comingSoon')}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && enabled && styles.cardPressed]}
    >
      <View style={[styles.iconCircle, { backgroundColor: iconBackgroundColor }]}>
        <SymbolView
          accessible={false}
          name={icon}
          size={25}
          tintColor={iconColor}
        />
      </View>
      <View style={styles.textBlock}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text numberOfLines={2} style={styles.description}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: '#f3f6fc',
    borderRadius: 14,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 8,
    justifyContent: 'center',
    minHeight: 80,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  cardPressed: {
    opacity: 0.72,
  },
  iconCircle: {
    alignItems: 'center',
    borderRadius: 22,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  label: {
    color: '#171528',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  textBlock: { flex: 1 },
  description: { color: '#6f7487', fontSize: 10.5, lineHeight: 14, marginTop: 3 },
});

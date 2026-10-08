import { useThemedStyles } from '../theme/useThemedStyles';
import { useTheme } from '../theme/ThemeProvider';
import type { ReactNode } from 'react';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '../i18n';

type ScreenHeaderProps = {
  title: string;
  onBack: () => void;
  backAccessibilityLabel?: string;
  right?: ReactNode;
};

export function ScreenHeader({ title, onBack, backAccessibilityLabel, right }: ScreenHeaderProps) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel={backAccessibilityLabel ?? t('common.backToHome')}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <SymbolView accessible={false} name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={21} tintColor={colors.text} />
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={1} pointerEvents="none" style={styles.title}>{title}</Text>
      <View pointerEvents="box-none" style={styles.right}>{right}</View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  header: { alignItems: 'center', minHeight: 52, justifyContent: 'center', position: 'relative' },
  backButton: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e5e7f0', borderRadius: 20, borderWidth: 1, height: 40, justifyContent: 'center', left: 0, position: 'absolute', width: 40 },
  title: { color: '#171528', fontSize: 18, fontWeight: '700', left: 54, position: 'absolute', right: 54, textAlign: 'center' },
  right: { alignItems: 'center', justifyContent: 'center', minHeight: 40, minWidth: 40, position: 'absolute', right: 0 },
  pressed: { opacity: 0.68 },
});

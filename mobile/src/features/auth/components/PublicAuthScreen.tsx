import { useThemedStyles } from '../../../theme/useThemedStyles';
import type { ReactNode, RefObject } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type PublicAuthScreenProps = {
  children: ReactNode;
  contentContainerStyle: StyleProp<ViewStyle>;
  topSpacing: number;
  bottomSpacing: number;
  scrollRef?: RefObject<ScrollView | null>;
};

export function PublicAuthScreen({ children, contentContainerStyle, topSpacing, bottomSpacing, scrollRef }: PublicAuthScreenProps) {
  const styles = useThemedStyles(baseStyles);
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[contentContainerStyle, {
          paddingTop: topSpacing + insets.top,
          paddingBottom: bottomSpacing + insets.bottom,
        }]}
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const baseStyles = StyleSheet.create({
  screen: { backgroundColor: '#f8f9ff', flex: 1 },
});

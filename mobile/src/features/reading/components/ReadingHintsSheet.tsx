import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useTheme } from '../../../theme/ThemeProvider';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';
import { getReadingHintContext, getReadingHintTypeLabel } from '../reading.presentation';
import type { ReadingHint } from '../reading.types';

type Props = {
  hint: ReadingHint | null;
  readingText: string;
  onClose: () => void;
  onHeightChange: (height: number) => void;
};

export function ReadingHintsSheet({ hint, readingText, onClose, onHeightChange }: Props) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  if (!hint) return null;
  const context = getReadingHintContext(readingText, hint.expression);
  return <View pointerEvents="box-none" style={styles.overlay}>
    <SafeAreaView edges={['bottom']} onLayout={(event) => onHeightChange(event.nativeEvent.layout.height)} style={styles.sheet}>
      <View style={styles.handle} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={styles.expression}>{hint.expression}</Text>
          <Pressable accessibilityLabel="Fechar dica" accessibilityRole="button" hitSlop={8} onPress={onClose} style={styles.closeButton}>
            <SymbolView accessible={false} name={{ ios: 'xmark', android: 'close', web: 'close' }} size={21} tintColor={colors.text} />
          </Pressable>
        </View>
        <Text style={styles.type}>{getReadingHintTypeLabel(hint.type)}</Text>
        <Text style={styles.explanation}>{hint.explanation}</Text>
        {context ? <View style={styles.contextBox}>
          <Text style={styles.contextLabel}>No texto</Text>
          <Text style={styles.context}>{context}</Text>
        </View> : null}
      </ScrollView>
    </SafeAreaView>
  </View>;
}

const baseStyles = StyleSheet.create({
  overlay: { bottom: 0, justifyContent: 'flex-end', left: 0, position: 'absolute', right: 0, top: 0 },
  sheet: { backgroundColor: '#f3f1ff', borderColor: '#d9d3ff', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, elevation: 6, maxHeight: '45%', paddingTop: 8, shadowColor: '#242136', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.14, shadowRadius: 12 },
  handle: { alignSelf: 'center', backgroundColor: '#9ca0b4', borderRadius: 3, height: 5, marginBottom: 12, width: 44 },
  content: { paddingBottom: 14, paddingHorizontal: 20 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  expression: { color: '#5147df', flex: 1, fontSize: 18, fontWeight: '800' },
  closeButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  type: { color: '#74798d', fontSize: 12, fontWeight: '700' },
  explanation: { color: '#242136', fontSize: 14, lineHeight: 21, marginTop: 9 },
  contextBox: { backgroundColor: '#ffffff', borderRadius: 10, marginTop: 12, padding: 11 },
  contextLabel: { color: '#5147df', fontSize: 12, fontWeight: '700', marginBottom: 4 },
  context: { color: '#4e5872', fontSize: 13, lineHeight: 19 },
});

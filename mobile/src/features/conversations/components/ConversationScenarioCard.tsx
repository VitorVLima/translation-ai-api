import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ConversationScenarioPresentation } from '../conversations.presentation';

type ConversationScenarioCardProps = {
  scenario: ConversationScenarioPresentation;
  selected: boolean;
  onPress: () => void;
};

export function ConversationScenarioCard({
  scenario,
  selected,
  onPress,
}: ConversationScenarioCardProps) {
  const styles = useThemedStyles(baseStyles);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageFailed = Boolean(scenario.avatarImageUrl && failedImageUrl === scenario.avatarImageUrl);

  return (
    <Pressable
      accessibilityLabel={`${scenario.displayName}. ${scenario.description}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.cardSelected,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.indicator, selected && styles.indicatorSelected]}>
        {selected ? (
          <SymbolView
            accessible={false}
            name={{ ios: 'checkmark', android: 'check', web: 'check' }}
            size={14}
            tintColor="#ffffff"
          />
        ) : null}
      </View>
      <View style={styles.avatar}>
        {scenario.avatarImageUrl && !imageFailed ? (
          <Image
            accessibilityIgnoresInvertColors
            onError={() => setFailedImageUrl(scenario.avatarImageUrl)}
            source={{ uri: scenario.avatarImageUrl }}
            style={styles.avatarImage}
          />
        ) : (
          <SymbolView
            accessible={false}
            name={{ ios: 'bubble.left.fill', android: 'chat_bubble', web: 'chat_bubble' }}
            size={25}
            tintColor="#5b50f5"
          />
        )}
      </View>

      <View style={styles.copy}>
        <Text numberOfLines={2} style={styles.title}>{scenario.displayName}</Text>
        {scenario.assistantDisplayName ? (
          <Text numberOfLines={1} style={styles.assistant}>Com {scenario.assistantDisplayName}</Text>
        ) : null}
        <Text numberOfLines={2} style={styles.description}>{scenario.description}</Text>
      </View>
    </Pressable>
  );
}

const baseStyles = StyleSheet.create({
  card: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e1e3ed',
    borderRadius: 17,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    maxWidth: '48.8%',
    minHeight: 132,
    padding: 10,
    position: 'relative',
  },
  cardSelected: {
    backgroundColor: '#f4f2ff',
    borderColor: '#5b50f5',
    borderWidth: 2,
    padding: 9,
  },
  cardPressed: { opacity: 0.78 },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#ebe8ff',
    borderRadius: 23,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 42,
  },
  avatarImage: { height: '100%', width: '100%' },
  copy: { alignItems: 'center', marginTop: 6, width: '100%' },
  title: { color: '#171528', fontSize: 13, fontWeight: '700', lineHeight: 17, textAlign: 'center' },
  assistant: { color: '#5b50f5', fontSize: 9.5, fontWeight: '600', marginTop: 2, textAlign: 'center' },
  description: { color: '#686e82', fontSize: 10.5, lineHeight: 14, marginTop: 4, textAlign: 'center' },
  indicator: {
    alignItems: 'center',
    borderColor: '#c8ccda',
    borderRadius: 10,
    borderWidth: 1.5,
    height: 20,
    justifyContent: 'center',
    position: 'absolute',
    right: 9,
    top: 9,
    width: 20,
  },
  indicatorSelected: { backgroundColor: '#5b50f5', borderColor: '#5b50f5' },
});

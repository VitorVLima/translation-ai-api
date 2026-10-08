import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useTheme } from '../../../theme/ThemeProvider';
import { useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { API_URL } from '../../../config/api';
import { getConversationDifficultyLabel } from '../conversations.presentation';
import type { ConversationSummary } from '../conversations.types';

type ConversationHeaderProps = {
  conversation: ConversationSummary;
  onBack: () => void;
  backLabel?: string;
};

function avatarUrl(path: string): string | null {
  if (!path) return null;
  try {
    return new URL(path, `${API_URL}/`).toString();
  } catch {
    return null;
  }
}

export function ConversationHeader({ conversation, onBack, backLabel = 'Voltar para conversas' }: ConversationHeaderProps) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageUrl = avatarUrl(conversation.assistantAvatarImageUrl);
  const imageFailed = Boolean(imageUrl && failedImageUrl === imageUrl);

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel={backLabel}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
      >
        <SymbolView accessible={false} name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={21} tintColor={colors.text} />
      </Pressable>
      <View style={styles.avatar}>
        {imageUrl && !imageFailed ? (
          <Image accessibilityIgnoresInvertColors onError={() => setFailedImageUrl(imageUrl)} source={{ uri: imageUrl }} style={styles.avatarImage} />
        ) : (
          <SymbolView accessible={false} name={{ ios: 'bubble.left.fill', android: 'chat_bubble', web: 'chat_bubble' }} size={23} tintColor="#5b50f5" />
        )}
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.name}>{conversation.assistantDisplayName || 'Assistente'}</Text>
        <Text numberOfLines={1} style={styles.context}>
          {conversation.scenarioDisplayName || conversation.title} · {getConversationDifficultyLabel(conversation.difficulty)}
        </Text>
      </View>
      <View style={styles.modeBadge}><Text style={styles.modeText}>{conversation.interactionMode === 'VOICE' ? 'Voz' : 'Texto'}</Text></View>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  header: { alignItems: 'center', backgroundColor: '#ffffff', borderBottomColor: '#e7e7f0', borderBottomWidth: 1, flexDirection: 'row', minHeight: 66, paddingHorizontal: 16, paddingVertical: 9 },
  backButton: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e5e7f0', borderRadius: 20, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  avatar: { alignItems: 'center', backgroundColor: '#ebe8ff', borderRadius: 21, height: 42, justifyContent: 'center', marginLeft: 3, overflow: 'hidden', width: 42 },
  avatarImage: { height: '100%', width: '100%' },
  copy: { flex: 1, marginLeft: 10, minWidth: 0 },
  modeBadge: { backgroundColor: '#f1efff', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 },
  modeText: { color: '#5b50f5', fontSize: 10, fontWeight: '700' },
  name: { color: '#171528', fontSize: 14.5, fontWeight: '700' },
  context: { color: '#74798d', fontSize: 10.5, marginTop: 3 },
  pressed: { opacity: 0.65 },
});

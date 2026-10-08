import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ConversationListItemPresentation } from '../conversations.presentation';

type ConversationListItemProps = {
  conversation: ConversationListItemPresentation;
  onContinue: () => void;
  onDelete?: () => void;
  deleteDisabled?: boolean;
};

export function ConversationListItem({ conversation, onContinue, onDelete, deleteDisabled = false }: ConversationListItemProps) {
  const styles = useThemedStyles(baseStyles);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageFailed = Boolean(conversation.avatarImageUrl && failedImageUrl === conversation.avatarImageUrl);

  return (
    <View style={[styles.card, conversation.completed && styles.completedCard]}>
      <Pressable
        accessibilityLabel={`${conversation.completed ? 'Ver conversa concluída' : 'Continuar conversa'}: ${conversation.title}`}
        accessibilityRole="button"
        onPress={onContinue}
        style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressed]}
      >
        <View style={[styles.avatar, conversation.completed && styles.completedAvatar]}>
          {conversation.avatarImageUrl && !imageFailed ? (
            <Image
              accessibilityIgnoresInvertColors
              onError={() => setFailedImageUrl(conversation.avatarImageUrl)}
              resizeMode="cover"
              source={{ uri: conversation.avatarImageUrl }}
              style={styles.avatarImage}
            />
          ) : (
            <SymbolView
              accessible={false}
              name={{ ios: 'bubble.left.fill', android: 'chat_bubble', web: 'chat_bubble' }}
              size={23}
              tintColor={conversation.completed ? '#777d91' : '#5b50f5'}
            />
          )}
        </View>

        <View style={styles.details}>
          <View style={styles.topRow}>
            <View style={[styles.badge, conversation.completed && styles.completedBadge]}>
              <View style={[styles.statusDot, conversation.completed && styles.completedDot]} />
              <Text style={[styles.badgeText, conversation.completed && styles.completedBadgeText]}>
                {conversation.completed ? 'CONCLUÍDA' : 'EM ANDAMENTO'}
              </Text>
            </View>
            <Text numberOfLines={1} style={styles.metadata}>
              {conversation.difficultyLabel} · {conversation.interactionModeLabel}
            </Text>
          </View>
          <Text numberOfLines={1} style={styles.title}>{conversation.title}</Text>
          {conversation.description ? (
            <Text numberOfLines={1} style={styles.description}>{conversation.description}</Text>
          ) : null}
          <Text numberOfLines={1} style={styles.footer}>
            {conversation.assistantDisplayName ? `Com ${conversation.assistantDisplayName} · ` : ''}
            {conversation.dateLabel}
          </Text>
        </View>

        <SymbolView
          accessible={false}
          name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
          size={17}
          tintColor={conversation.completed ? '#8b91a5' : '#5147df'}
        />
      </Pressable>
      {!conversation.completed && onDelete ? (
        <Pressable
          accessibilityLabel={`Excluir conversa: ${conversation.title}`}
          accessibilityRole="button"
          accessibilityState={{ busy: deleteDisabled, disabled: deleteDisabled }}
          disabled={deleteDisabled}
          hitSlop={8}
          onPress={onDelete}
          style={({ pressed }) => [styles.moreButton, pressed && styles.moreButtonPressed]}
        >
          <SymbolView
            accessible={false}
            name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }}
            size={20}
            tintColor="#535a72"
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#e9ebf4',
    borderRadius: 17,
    borderWidth: 1,
    elevation: 1,
    padding: 10,
    position: 'relative',
    shadowColor: '#24285a',
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.045,
    shadowRadius: 8,
  },
  cardPressable: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingRight: 30 },
  completedCard: { borderColor: '#e5e8f0' },
  cardPressed: { opacity: 0.78 },
  avatar: {
    alignItems: 'center',
    backgroundColor: '#ebe8ff',
    borderRadius: 14,
    height: 66,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 58,
  },
  completedAvatar: { backgroundColor: '#f0f2f6' },
  avatarImage: { height: '100%', width: '100%' },
  details: { flex: 1, gap: 3, minWidth: 0 },
  topRow: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  badge: {
    alignItems: 'center',
    backgroundColor: '#ebe8ff',
    borderRadius: 12,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  completedBadge: { backgroundColor: '#e0f5eb' },
  statusDot: { backgroundColor: '#5b50f5', borderRadius: 3, height: 6, width: 6 },
  completedDot: { backgroundColor: '#10a870' },
  badgeText: { color: '#5147df', fontSize: 8.5, fontWeight: '800', letterSpacing: 0.3 },
  completedBadgeText: { color: '#138254' },
  metadata: { color: '#747b94', flexShrink: 1, fontSize: 10, fontWeight: '600', textAlign: 'right' },
  title: { color: '#171a34', fontSize: 14, fontWeight: '800', lineHeight: 18 },
  description: { color: '#69728c', fontSize: 11.5, lineHeight: 15 },
  footer: { color: '#7c8499', fontSize: 9.5, lineHeight: 13 },
  moreButton: { alignItems: 'center', borderRadius: 16, height: 32, justifyContent: 'center', position: 'absolute', right: 5, top: 5, width: 32 },
  moreButtonPressed: { backgroundColor: '#f0efff' },
});

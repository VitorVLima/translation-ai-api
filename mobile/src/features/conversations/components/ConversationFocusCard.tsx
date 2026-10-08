import { useTheme } from '../../../theme/ThemeProvider';
import { useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Image, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import type { HomeConversationPresentation } from '../conversations.presentation';
import { useI18n } from '../../../i18n';

type ConversationFocusCardProps = {
  presentation: HomeConversationPresentation | null;
  status: 'loading' | 'success' | 'error';
  onPrimaryPress: () => void;
  onRetry: () => void;
  onSeeAllPress: () => void;
};

export function ConversationFocusCard({
  presentation,
  status,
  onPrimaryPress,
  onRetry,
  onSeeAllPress,
}: ConversationFocusCardProps) {
  const styles = baseStyles;
  const { colors } = useTheme();
  const { t } = useI18n();
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageUrl = presentation?.kind === 'continue' ? presentation.avatarImageUrl : null;
  const imageFailed = Boolean(imageUrl && failedImageUrl === imageUrl);

  return (
    <ImageBackground
      accessible={false}
      imageStyle={styles.backgroundImage}
      resizeMode="cover"
      source={require('../../../../assets/fundo-home-conversa.png')}
      style={[styles.card, { borderColor: colors.border }]}
    >
      {status === 'loading' ? (
        <View accessibilityLiveRegion="polite" accessibilityRole="progressbar" style={styles.loading}>
          <ActivityIndicator color="#5b50f5" />
          <Text style={styles.loadingText}>{t('home.conversationLoading')}</Text>
        </View>
      ) : null}

      {status === 'error' ? (
        <View accessibilityLiveRegion="polite" style={styles.errorContent}>
          <View style={styles.heroIcon}>
            <SymbolView
              accessible={false}
              name={{ ios: 'exclamationmark.bubble.fill', android: 'error', web: 'error' }}
              size={28}
              tintColor="#5b50f5"
            />
          </View>
          <Text style={styles.eyebrow}>{t('home.conversationEyebrow')}</Text>
          <Text style={styles.title}>{t('home.conversationError')}</Text>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={onRetry}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.secondaryButtonText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      {status === 'success' && presentation?.kind === 'continue' ? (
        <>
          <View style={styles.topRow}>
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>{t('home.inProgress')}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={onSeeAllPress}
              style={({ pressed }) => pressed && styles.linkPressed}
            >
              <Text style={styles.seeAll}>{t('home.seeAll')}</Text>
            </Pressable>
          </View>
          <Text style={styles.eyebrow}>{t('home.continueConversation')}</Text>
          <View style={styles.conversationBody}>
            <View style={styles.assistantAvatar}>
              {imageUrl && !imageFailed ? (
                <Image
                  accessibilityIgnoresInvertColors
                  onError={() => setFailedImageUrl(imageUrl)}
                  source={{ uri: imageUrl }}
                  style={styles.assistantImage}
                />
              ) : (
                <SymbolView
                  accessible={false}
                  name={{ ios: 'bubble.left.fill', android: 'chat_bubble', web: 'chat_bubble' }}
                  size={28}
                  tintColor="#5b50f5"
                />
              )}
            </View>
            <View style={styles.conversationText}>
              <Text numberOfLines={2} style={styles.title}>{presentation.title}</Text>
              <Text numberOfLines={1} style={styles.metadata}>
                {presentation.difficultyLabel}
                {presentation.updatedLabel ? ` · ${presentation.updatedLabel}` : ''}
              </Text>
              {presentation.conversation.assistantDisplayName ? (
                <Text numberOfLines={1} style={styles.assistantName}>
                  {t('home.withAssistant', { name: presentation.conversation.assistantDisplayName })}
                </Text>
              ) : null}
            </View>
          </View>
          <Pressable
            accessibilityLabel={`${t('home.continue')} ${presentation.title}`}
            accessibilityRole="button"
            onPress={onPrimaryPress}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.primaryButtonText}>{t('home.continue')}</Text>
            <SymbolView
              accessible={false}
              name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }}
              size={18}
              tintColor="#ffffff"
            />
          </Pressable>
        </>
      ) : null}

      {status === 'success' && presentation?.kind === 'new' ? (
        <View style={styles.newConversationContent}>
          <View style={styles.heroIcon}>
            <SymbolView
              accessible={false}
              name={{ ios: 'bubble.left.and.bubble.right.fill', android: 'forum', web: 'forum' }}
              size={30}
              tintColor="#5b50f5"
            />
          </View>
          <Text style={styles.eyebrow}>{t('home.chatWithAi')}</Text>
          <Text style={styles.title}>{presentation.title}</Text>
          <Text style={styles.description}>{presentation.description}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={onPrimaryPress}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
          >
            <Text style={styles.primaryButtonText}>{presentation.actionLabel}</Text>
            <SymbolView
              accessible={false}
              name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }}
              size={18}
              tintColor="#ffffff"
            />
          </Pressable>
        </View>
      ) : null}
    </ImageBackground>
  );
}

const baseStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ebe8ff',
    borderColor: '#dcd6ff',
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 18,
    minHeight: 178,
    overflow: 'hidden',
    padding: 16,
  },
  backgroundImage: { borderRadius: 17 },
  loading: {
    alignItems: 'center',
    flex: 1,
    gap: 10,
    justifyContent: 'center',
    minHeight: 144,
  },
  loadingText: { color: '#5f5884', fontSize: 12, textShadowColor: '#ffffff', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 },
  errorContent: { alignItems: 'flex-start', minHeight: 144, justifyContent: 'center' },
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  statusBadge: {
    alignItems: 'center',
    backgroundColor: '#dcd6ff',
    borderRadius: 9,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  statusDot: { backgroundColor: '#5b50f5', borderRadius: 4, height: 7, width: 7 },
  statusText: { color: '#5147df', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  seeAll: { color: '#4034b5', fontSize: 11.5, fontWeight: '800', textShadowColor: '#ffffff', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 },
  linkPressed: { opacity: 0.65 },
  eyebrow: { color: '#4034b5', fontSize: 10, fontWeight: '800', letterSpacing: 0.7, marginTop: 10, textShadowColor: '#ffffff', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 },
  conversationBody: { alignItems: 'center', flexDirection: 'row', marginTop: 9 },
  assistantAvatar: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 27,
    height: 54,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 54,
  },
  assistantImage: { height: '100%', width: '100%' },
  conversationText: { flex: 1, marginLeft: 12 },
  title: { color: '#171528', fontSize: 18, fontWeight: '700', lineHeight: 23, textShadowColor: '#ffffff', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 },
  metadata: { color: '#3f465f', fontSize: 11.5, fontWeight: '600', marginTop: 4, textShadowColor: '#ffffff', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 },
  assistantName: { color: '#4d536d', fontSize: 10.5, fontWeight: '600', marginTop: 3, textShadowColor: '#ffffff', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 },
  description: { color: '#3f465f', fontSize: 12.5, lineHeight: 18, marginTop: 5, maxWidth: 285, textShadowColor: '#ffffff', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 },
  primaryButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#5b50f5',
    borderRadius: 11,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 14,
    minHeight: 46,
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  buttonPressed: { opacity: 0.78 },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 42,
    paddingHorizontal: 14,
  },
  secondaryButtonText: { color: '#5147df', fontSize: 12, fontWeight: '700' },
  newConversationContent: { alignItems: 'flex-start', minHeight: 144, justifyContent: 'center' },
  heroIcon: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
});

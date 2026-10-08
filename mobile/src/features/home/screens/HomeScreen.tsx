import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useTheme } from '../../../theme/ThemeProvider';
import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL } from '../../../config/api';
import { PageLoading } from '../../../components/PageLoading';
import { getSession } from '../../auth/auth.session';
import { ConversationFocusCard } from '../../conversations/components/ConversationFocusCard';
import { getHomeConversationPresentation } from '../../conversations/conversations.presentation';
import { getConversations } from '../../conversations/conversations.service';
import { getProgressOverview } from '../../progress/progress.service';
import { getHomeProfilePresentation } from '../../profile/profile.presentation';
import { getHomeProfileData } from '../../profile/profile.service';
import { getDailyVocabulary } from '../../vocabulary/vocabulary.service';
import { hasHomeDataFailures, mergeHomeData, type HomeData } from '../home.data';
import { HomeDailyGoalCard } from '../components/HomeDailyGoalCard';
import { HomeEditorialCard } from '../components/HomeEditorialCard';
import { HomeVocabularyCard } from '../components/HomeVocabularyCard';
import { ProfileCompletionCard } from '../components/ProfileCompletionCard';
import { QuickPracticeCard } from '../components/QuickPracticeCard';
import { useI18n } from '../../../i18n';

type PageState = { status: 'loading' | 'success' | 'error'; data: HomeData | null };
type LoadMode = 'focus' | 'refresh' | 'retry';

export function HomeScreen() {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  const { t } = useI18n();
  const user = getSession()?.user ?? null;
  const [page, setPage] = useState<PageState>({ status: 'loading', data: null });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const dataRef = useRef<HomeData | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const versionRef = useRef(0);
  const mountedRef = useRef(true);

  const loadHome = useCallback(async (mode: LoadMode) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    const version = ++versionRef.current;
    requestRef.current = controller;
    const hasData = dataRef.current !== null;

    if (!hasData) {
      setPage({ status: 'loading', data: null });
      setRefreshError(false);
    } else if (mode === 'refresh') {
      setIsRefreshing(true);
      setRefreshError(false);
    }

    const settled = await Promise.all([
      Promise.allSettled([getHomeProfileData(controller.signal)]),
      Promise.allSettled([getDailyVocabulary(controller.signal)]),
      Promise.allSettled([getProgressOverview(controller.signal)]),
      Promise.allSettled([getConversations(controller.signal)]),
    ]);
    const results = [settled[0][0], settled[1][0], settled[2][0], settled[3][0]] as const;

    if (controller.signal.aborted || version !== versionRef.current || !mountedRef.current) return;

    const data = mergeHomeData(dataRef.current, results);
    if (data) {
      dataRef.current = data;
      setPage({ status: 'success', data });
      setRefreshError(hasHomeDataFailures(results));
    } else {
      setPage({ status: 'error', data: null });
    }

    if (requestRef.current === controller) requestRef.current = null;
    if (mode === 'refresh' && version === versionRef.current) setIsRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => {
    mountedRef.current = true;
    setIsRefreshing(false);
    void loadHome('focus');
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      requestRef.current = null;
      versionRef.current += 1;
    };
  }, [loadHome]));

  const refreshHome = useCallback(() => {
    void loadHome('refresh');
  }, [loadHome]);

  if (!page.data && page.status === 'loading') return <PageLoading label={t('home.loading')} />;
  if (!page.data) return <HomeError onRetry={() => void loadHome('retry')} />;

  const data = page.data;
  const profilePresentation = getHomeProfilePresentation(user, data.profile.profile, data.profile.avatars, API_URL);
  const conversationPresentation = getHomeConversationPresentation(data.conversations, API_URL);

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.contentSafeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl colors={['#5b50f5']} onRefresh={refreshHome} refreshing={isRefreshing} tintColor="#5b50f5" />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <View accessibilityLabel={profilePresentation.displayName ? t('home.profileOf', { name: profilePresentation.displayName }) : t('home.userProfile')} style={styles.avatar}>
                {profilePresentation.avatarImageUrl && !avatarFailed ? (
                  <Image accessibilityIgnoresInvertColors onError={() => setAvatarFailed(true)} source={{ uri: profilePresentation.avatarImageUrl }} style={styles.avatarImage} />
                ) : profilePresentation.initial ? (
                  <Text style={styles.avatarInitial}>{profilePresentation.initial}</Text>
                ) : (
                  <SymbolView accessible={false} name={{ ios: 'person.fill', android: 'person', web: 'person' }} size={25} tintColor="#523526" />
                )}
              </View>
              <View style={styles.greetingBlock}>
                <Text accessibilityRole="header" style={styles.greeting}>{profilePresentation.firstName ? t('home.greeting', { name: profilePresentation.firstName }) : t('home.greetingDefault')}</Text>
                <Text style={styles.greetingSubtitle}>{t('home.subtitle')}</Text>
              </View>
              <Pressable accessibilityLabel={t('home.notifications')} accessibilityRole="button" accessibilityState={{ disabled: true }} disabled style={styles.notificationButton}>
                <SymbolView accessible={false} name={{ ios: 'bell.fill', android: 'notifications', web: 'notifications' }} size={21} tintColor={colors.text} />
              </Pressable>
            </View>

            {refreshError ? <View accessibilityLiveRegion="polite" style={styles.refreshError}><Text style={styles.refreshErrorText}>{t('home.refreshError')}</Text><Pressable accessibilityRole="button" onPress={refreshHome}><Text style={styles.refreshRetryText}>{t('common.retry')}</Text></Pressable></View> : null}
            {profilePresentation.showCompletion ? <ProfileCompletionCard onPress={() => router.push('/profile')} /> : null}

            <ConversationFocusCard
              onPrimaryPress={() => {
                if (conversationPresentation.kind === 'continue') router.push({ pathname: '/conversations/[id]', params: { id: conversationPresentation.conversation.id } });
                else router.push('/conversations/new');
              }}
              onRetry={refreshHome}
              onSeeAllPress={() => router.push('/conversations')}
              presentation={conversationPresentation}
              status="success"
            />
            <HomeVocabularyCard lesson={data.vocabulary} onPress={() => router.push('/practice/vocabulary')} onRetry={refreshHome} status="success" />
            <HomeDailyGoalCard goal={data.progress.dailyGoal} onConversationPress={() => router.push('/conversations')} onReadingPress={() => router.push('/practice/reading')} onRetry={refreshHome} onVocabularyPress={() => router.push('/practice/vocabulary')} status="success" />

            <View style={styles.section}>
              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>{t('home.tools')}</Text>
                <Pressable accessibilityLabel={t('home.allPractice')} accessibilityRole="button" onPress={() => router.push('/practice')}><Text style={styles.sectionLink}>{t('home.allPractice')} →</Text></Pressable>
              </View>
              <View style={styles.practiceGrid}>
                <QuickPracticeCard description={t('home.translateDescription')} label={t('home.translate')} icon={{ ios: 'arrow.left.arrow.right', android: 'sync_alt', web: 'sync_alt' }} iconColor="#2878dc" iconBackgroundColor="#dcecff" onPress={() => router.push('/practice/translator')} />
                <QuickPracticeCard description={t('home.correctionDescription')} label={t('home.correction')} icon={{ ios: 'square.and.pencil', android: 'edit_square', web: 'edit_square' }} iconColor="#e34e54" iconBackgroundColor="#ffe5e5" onPress={() => router.push('/practice/correction')} />
              </View>
            </View>
            <HomeEditorialCard />
          </View>
        </ScrollView>
      </SafeAreaView>
      <StatusBar style="auto" />
    </View>
  );
}

function HomeError({ onRetry }: { onRetry: () => void }) {
  const styles = useThemedStyles(baseStyles);
  const { t } = useI18n();
  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.errorSafeArea}>
        <View accessibilityLiveRegion="polite" style={styles.errorState}>
          <View style={styles.errorIcon}><SymbolView accessible={false} name={{ ios: 'exclamationmark.circle.fill', android: 'error', web: 'error' }} size={27} tintColor="#5b50f5" /></View>
          <Text accessibilityRole="header" style={styles.errorTitle}>{t('home.errorTitle')}</Text>
          <Text style={styles.errorDescription}>{t('home.errorDescription')}</Text>
          <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}><Text style={styles.retryText}>{t('common.retry')}</Text></Pressable>
        </View>
      </SafeAreaView>
      <StatusBar style="auto" />
    </View>
  );
}

const baseStyles = StyleSheet.create({
  screen: { backgroundColor: '#f8f9ff', flex: 1 },
  contentSafeArea: { flex: 1 },
  errorSafeArea: { flex: 1 },
  scrollContent: { alignItems: 'center', flexGrow: 1, paddingBottom: 28, paddingHorizontal: 20, paddingTop: 10 },
  content: { maxWidth: 430, width: '100%' },
  header: { alignItems: 'center', flexDirection: 'row', minHeight: 54 },
  avatar: { alignItems: 'center', backgroundColor: '#efc49f', borderColor: '#ffffff', borderRadius: 24, borderWidth: 2, height: 48, justifyContent: 'center', overflow: 'hidden', width: 48 },
  avatarImage: { height: '100%', width: '100%' },
  avatarInitial: { color: '#523526', fontSize: 20, fontWeight: '700' },
  greetingBlock: { flex: 1, marginLeft: 12 },
  greeting: { color: '#171528', fontSize: 18, fontWeight: '700' },
  greetingSubtitle: { color: '#7b8195', fontSize: 12.5, marginTop: 3 },
  notificationButton: { alignItems: 'center', height: 44, justifyContent: 'center', marginLeft: 8, width: 44 },
  section: { marginTop: 17 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 9 },
  sectionTitle: { color: '#171528', fontSize: 16, fontWeight: '800' },
  sectionLink: { color: '#5147df', fontSize: 11.5, fontWeight: '800' },
  practiceGrid: { flexDirection: 'row', gap: 10 },
  refreshError: { alignItems: 'center', backgroundColor: '#fff4ee', borderColor: '#ffdccc', borderRadius: 11, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, minHeight: 44, paddingHorizontal: 12 },
  refreshErrorText: { color: '#7b4a36', flex: 1, fontSize: 11 },
  refreshRetryText: { color: '#a34d2b', fontSize: 11, fontWeight: '700', marginLeft: 8 },
  errorState: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 },
  errorIcon: { alignItems: 'center', backgroundColor: '#ebe8ff', borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  errorTitle: { color: '#171528', fontSize: 18, fontWeight: '700', marginTop: 14, textAlign: 'center' },
  errorDescription: { color: '#74798d', fontSize: 13, lineHeight: 19, marginTop: 7, textAlign: 'center' },
  retryButton: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 11, justifyContent: 'center', marginTop: 17, minHeight: 44, paddingHorizontal: 18 },
  retryText: { color: '#ffffff', fontSize: 12.5, fontWeight: '700' },
  pressed: { opacity: 0.78 },
});

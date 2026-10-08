import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useCallback, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL } from '../../../config/api';
import { PageLoading } from '../../../components/PageLoading';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { useDeterministicBack } from '../../../hooks/use-deterministic-back';
import { getBackDestination } from '../../../navigation/back-destinations';
import { getSession, logoutSession } from '../../auth/auth.session';
import {
  getHomeProfileData,
  setPredefinedAvatar,
  updateProfile,
  type HomeProfileData,
} from '../profile.service';
import { getHomeProfilePresentation } from '../profile.presentation';
import { formatCivilDate, formatCivilDateForDisplay, getUtcTodayPickerDate, isFutureCivilDate, parseCivilDate } from '../profile.date';
import type { AvatarResponse, EnglishLevel, LearningGoal } from '../profile.types';
import { useI18n } from '../../../i18n';
import type { TranslationKey } from '../../../i18n/translations';
import { useTheme } from '../../../theme/ThemeProvider';
import { isThemeOptionAvailable, type ThemePreference } from '../../../theme/theme';

type ProfileLoadState =
  | { status: 'loading'; data: HomeProfileData | null }
  | { status: 'success'; data: HomeProfileData }
  | { status: 'error'; data: HomeProfileData | null };

const LEVELS: EnglishLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const GOALS: LearningGoal[] = ['GENERAL', 'CONVERSATION', 'WORK', 'TRAVEL', 'STUDY'];

function SelectableOption({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const styles = useThemedStyles(baseStyles);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.optionPressed]}
    >
      <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{label}</Text>
      {selected ? <SymbolView accessible={false} name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={17} tintColor="#5b50f5" /> : null}
    </Pressable>
  );
}

function AvatarChoice({
  avatar,
  selected,
  onPress,
}: {
  avatar: AvatarResponse;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(baseStyles);
  const { t } = useI18n();
  let imageUri = avatar.imageUrl;
  try {
    imageUri = new URL(avatar.imageUrl, `${API_URL}/`).toString();
  } catch {
    imageUri = avatar.imageUrl;
  }

  return (
    <Pressable
      accessibilityLabel={avatar.key === 'avatar_default' ? t('profile.defaultAvatar') : `Avatar ${avatar.displayName}`}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.avatarChoice, selected && styles.avatarChoiceSelected, pressed && styles.optionPressed]}
    >
      <Image accessibilityIgnoresInvertColors source={{ uri: imageUri }} style={styles.avatarChoiceImage} />
      {selected ? (
        <View style={styles.avatarCheck}>
          <SymbolView accessible={false} name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={13} tintColor="#ffffff" />
        </View>
      ) : null}
    </Pressable>
  );
}

function ProfileRow({ label, value, icon }: { label: string; value: string; icon: 'person' | 'mail' | 'school' | 'target' | 'calendar' }) {
  const styles = useThemedStyles(baseStyles);
  const iconNames = {
    person: { ios: 'person.fill', android: 'person', web: 'person' },
    mail: { ios: 'envelope.fill', android: 'mail', web: 'mail' },
    school: { ios: 'graduationcap.fill', android: 'school', web: 'school' },
    target: { ios: 'target', android: 'track_changes', web: 'track_changes' },
    calendar: { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' },
  } as const;
  const iconName = iconNames[icon];

  return (
    <View style={styles.profileRow}>
      <View style={styles.rowIcon}>
        <SymbolView accessible={false} name={iconName} size={17} tintColor="#5b50f5" />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text numberOfLines={2} style={styles.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

export function ProfileScreen() {
  const styles = useThemedStyles(baseStyles);
  const { t } = useI18n();
  const { colors, preference, resolved, setPreference } = useTheme();
  const [appearanceVisible, setAppearanceVisible] = useState(false);
  const [appearanceError, setAppearanceError] = useState(false);
  const [isSavingTheme, setIsSavingTheme] = useState(false);
  const session = getSession();
  const user = session?.user ?? null;
  const [state, setState] = useState<ProfileLoadState>({ status: 'loading', data: null });
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false);
  const [selectedAvatarKey, setSelectedAvatarKey] = useState<string | null>(null);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftBirthDate, setDraftBirthDate] = useState<string | null>(null);
  const [birthDatePickerVisible, setBirthDatePickerVisible] = useState(false);
  const [birthDateError, setBirthDateError] = useState<TranslationKey | null>(null);
  const [draftLevel, setDraftLevel] = useState<EnglishLevel | null>(null);
  const [draftGoal, setDraftGoal] = useState<LearningGoal | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [editError, setEditError] = useState(false);
  const [feedback, setFeedback] = useState<TranslationKey | null>(null);
  const profileRequestId = useRef(0);
  const profileController = useRef<AbortController | null>(null);
  const goHome = useCallback(() => router.replace(getBackDestination('profile')), []);

  useDeterministicBack(goHome);

  const loadProfile = useCallback(async () => {
    if (!getSession()) {
      router.replace('/login');
      return;
    }
    profileController.current?.abort();
    const controller = new AbortController();
    const requestId = ++profileRequestId.current;
    profileController.current = controller;
    setFeedback(null);
    setState((current) => ({ status: 'loading', data: current.data }));
    try {
      const data = await getHomeProfileData(controller.signal);
      if (requestId !== profileRequestId.current) return;
      setState({ status: 'success', data });
    } catch {
      if (requestId === profileRequestId.current) setState((current) => ({ status: 'error', data: current.data }));
    } finally {
      if (profileController.current === controller) profileController.current = null;
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadProfile();
    return () => {
      profileRequestId.current += 1;
      profileController.current?.abort();
      profileController.current = null;
    };
  }, [loadProfile]));

  const presentation = useMemo(
    () => getHomeProfilePresentation(user, state.data?.profile ?? null, state.data?.avatars ?? [], API_URL),
    [state.data, user],
  );
  const profile = state.data?.profile ?? null;
  const goal = profile?.learningGoal ? t(`domain.goal.${profile.learningGoal}`) : null;
  const displayName = presentation.displayName || t('profile.your');

  const avatarFailed = Boolean(presentation.avatarImageUrl && failedAvatarUrl === presentation.avatarImageUrl);

  function requestLogout() {
    Alert.alert(
      t('profile.logout'),
      t('profile.logoutHint'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('profile.logoutConfirm'), style: 'destructive', onPress: () => void performLogout() },
      ],
    );
  }

  async function performLogout() {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await logoutSession();
      router.replace('/login');
    } catch {
      // A sessão local já é encerrada mesmo se a revogação remota falhar.
      router.replace('/login');
    } finally {
      setIsLoggingOut(false);
    }
  }

  function openAvatarPicker() {
    setAvatarError(false);
    setSelectedAvatarKey(profile?.avatarKey ?? null);
    setAvatarPickerVisible(true);
  }

  async function chooseTheme(next: ThemePreference) {
    if (isSavingTheme || !isThemeOptionAvailable(next) || next === preference) return;
    setIsSavingTheme(true);
    setAppearanceError(false);
    try {
      await setPreference(next);
    } catch {
      setAppearanceError(true);
    } finally {
      setIsSavingTheme(false);
    }
  }

  async function saveAvatar() {
    if (!selectedAvatarKey || !profile || isSavingAvatar || selectedAvatarKey === profile.avatarKey) {
      if (selectedAvatarKey === profile?.avatarKey) setAvatarPickerVisible(false);
      return;
    }
    setIsSavingAvatar(true);
    setAvatarError(false);
    try {
      const updated = await setPredefinedAvatar(selectedAvatarKey);
      setState((current) => current.data ? { status: 'success', data: { ...current.data, profile: updated } } : current);
      setAvatarPickerVisible(false);
      setFeedback('profile.avatarUpdated');
    } catch {
      setAvatarError(true);
    } finally {
      setIsSavingAvatar(false);
    }
  }

  function openEditor() {
    if (!profile) return;
    setDraftName(profile.preferredName ?? '');
    setDraftBirthDate(profile.birthDate);
    setBirthDateError(null);
    setBirthDatePickerVisible(false);
    setDraftLevel(profile.englishLevel);
    setDraftGoal(profile.learningGoal);
    setEditError(false);
    setEditVisible(true);
  }

  async function saveProfile() {
    if (!profile || isSavingProfile) return;
    const preferredName = draftName.trim();
    if (!draftBirthDate) {
      setBirthDateError('profile.birthDateRequired');
      return;
    }
    if (!parseCivilDate(draftBirthDate) || isFutureCivilDate(draftBirthDate)) {
      setBirthDateError('profile.birthDateInvalid');
      return;
    }
    if (!preferredName || preferredName.length > 100) {
      setEditError(true);
      return;
    }
    setIsSavingProfile(true);
    setEditError(false);
    try {
      const updated = await updateProfile({
        birthDate: draftBirthDate,
        englishLevel: draftLevel,
        learningGoal: draftGoal,
        preferredName: preferredName || null,
      });
      setState((current) => current.data ? { status: 'success', data: { ...current.data, profile: updated } } : current);
      setEditVisible(false);
      setFeedback('profile.updated');
    } catch {
      setEditError(true);
    } finally {
      setIsSavingProfile(false);
    }
  }

  function openBirthDatePicker() {
    setBirthDateError(null);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        maximumDate: getUtcTodayPickerDate(),
        mode: 'date',
        onValueChange: (_event, date) => {
          setDraftBirthDate(formatCivilDate(date));
          setBirthDateError(null);
        },
        value: parseCivilDate(draftBirthDate) ?? getUtcTodayPickerDate(),
      });
      return;
    }
    setBirthDatePickerVisible(true);
  }

  if (state.status === 'loading' && !state.data) {
    return <PageLoading label={t('profile.loading')} onBack={goHome} title={t('profile.title')} />;
  }

  if (state.status === 'error' && !state.data) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
        <View style={styles.profileHeader}><ScreenHeader onBack={goHome} title={t('profile.title')} /></View>
        <View style={styles.centerState}>
          <View style={styles.errorIcon}>
            <SymbolView accessible={false} name={{ ios: 'exclamationmark', android: 'error', web: 'error' }} size={24} tintColor="#d95b63" />
          </View>
          <Text accessibilityRole="header" style={styles.stateTitle}>{t('profile.loadError')}</Text>
          <Text style={styles.stateText}>{t('profile.connectionHint')}</Text>
          <Pressable accessibilityRole="button" onPress={() => void loadProfile()} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
        <StatusBar style="auto" />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl colors={['#5b50f5']} onRefresh={() => void loadProfile()} refreshing={state.status === 'loading'} tintColor="#5b50f5" />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.contentHeader}><ScreenHeader onBack={goHome} title={t('profile.title')} /></View>

            {feedback ? <View accessibilityLiveRegion="polite" style={styles.feedback}><SymbolView accessible={false} name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={16} tintColor="#2e8b64" /><Text style={styles.feedbackText}>{t(feedback)}</Text></View> : null}

            {state.status === 'error' ? (
              <View style={styles.inlineError}>
                <Text style={styles.inlineErrorText}>{t('profile.refreshError')}</Text>
                <Pressable accessibilityLabel={t('profile.retryRefresh')} accessibilityRole="button" onPress={() => void loadProfile()}>
                  <Text style={styles.inlineRetryText}>{t('common.retry')}</Text>
                </Pressable>
              </View>
            ) : null}

            <View style={styles.heroCard}>
              <View style={styles.avatarWrap}>
                <View style={styles.avatar}>
                {presentation.avatarImageUrl && !avatarFailed ? (
                  <Image
                    accessibilityIgnoresInvertColors
                    accessibilityLabel={t('profile.avatarOf', { name: displayName })}
                    onError={() => setFailedAvatarUrl(presentation.avatarImageUrl)}
                    source={{ uri: presentation.avatarImageUrl }}
                    style={styles.avatarImage}
                  />
                ) : presentation.initial ? (
                  <Text style={styles.avatarInitial}>{presentation.initial}</Text>
                ) : (
                  <SymbolView accessible={false} name={{ ios: 'person.fill', android: 'person', web: 'person' }} size={34} tintColor="#523526" />
                )}
                </View>
                <Pressable
                  accessibilityLabel={t('profile.chooseAvatarAction')}
                  accessibilityRole="button"
                  onPress={openAvatarPicker}
                  style={({ pressed }) => [styles.cameraButton, pressed && styles.cameraPressed]}
                >
                  <SymbolView accessible={false} name={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }} size={16} tintColor="#ffffff" />
                </Pressable>
              </View>
              <Text style={styles.name}>{displayName}</Text>
              <Text style={styles.email}>{user?.email ?? t('profile.emailUnavailable')}</Text>
            </View>

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>{t('profile.info')}</Text>
              <Pressable accessibilityLabel={t('profile.edit')} accessibilityRole="button" onPress={openEditor} style={styles.editButton}>
                <SymbolView accessible={false} name={{ ios: 'pencil', android: 'edit', web: 'edit' }} size={15} tintColor="#5b50f5" />
                <Text style={styles.editButtonText}>{t('profile.edit')}</Text>
              </Pressable>
            </View>
            <View style={styles.infoCard}>
              <ProfileRow icon="person" label={t('profile.name')} value={displayName} />
              <View style={styles.divider} />
              <ProfileRow icon="mail" label="E-mail" value={user?.email ?? t('common.notProvided')} />
              <View style={styles.divider} />
              <ProfileRow icon="calendar" label={t('profile.birthDate')} value={formatCivilDateForDisplay(profile?.birthDate ?? null) ?? t('common.notProvided')} />
              <View style={styles.divider} />
              <ProfileRow icon="school" label={t('profile.englishLevel')} value={presentation.levelLabel} />
              {goal ? (
                <>
                  <View style={styles.divider} />
                  <ProfileRow icon="target" label={t('profile.goal')} value={goal} />
                </>
              ) : null}
            </View>

            <Text style={styles.sectionTitle}>{t('settings.title')}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={t('settings.appearance')} onPress={() => { setAppearanceError(false); setAppearanceVisible(true); }} style={({ pressed }) => [styles.settingsRow, pressed && styles.optionPressed]}>
              <View style={styles.rowIcon}><SymbolView accessible={false} name={{ ios: 'circle.lefthalf.filled', android: 'contrast', web: 'contrast' }} size={18} tintColor={colors.primary} /></View>
              <View style={styles.rowText}><Text style={styles.settingsTitle}>{t('settings.appearance')}</Text><Text style={styles.settingsHint}>{t('settings.appearanceHint')}</Text></View>
              <SymbolView accessible={false} name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={19} tintColor={colors.textSecondary} />
            </Pressable>

            <Pressable
              accessibilityLabel={t('profile.logout')}
              accessibilityRole="button"
              accessibilityState={{ disabled: isLoggingOut }}
              disabled={isLoggingOut}
              onPress={requestLogout}
              style={({ pressed }) => [styles.logoutButton, pressed && styles.logoutPressed]}
            >
              {isLoggingOut ? <ActivityIndicator color="#d95b63" size="small" /> : <SymbolView accessible={false} name={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }} size={18} tintColor="#d95b63" />}
              <Text style={styles.logoutText}>{isLoggingOut ? t('profile.loggingOut') : t('profile.logout')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
      <StatusBar style="auto" />

      <Modal animationType="slide" onRequestClose={() => { if (!isSavingTheme) setAppearanceVisible(false); }} transparent visible={appearanceVisible}>
        <View style={styles.modalBackdrop}>
          <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text accessibilityRole="header" style={styles.sheetTitle}>{t('settings.appearance')}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} disabled={isSavingTheme} onPress={() => setAppearanceVisible(false)} style={styles.closeButton}>
                <SymbolView accessible={false} name={{ ios: 'xmark', android: 'close', web: 'close' }} size={19} tintColor={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.sectionTitle}>{t('settings.theme')}</Text>
            {(['light', 'dark', 'system'] as const).map((option) => {
              const available = isThemeOptionAvailable(option);
              return <Pressable key={option} accessibilityRole="radio" accessibilityLabel={`${t(`settings.${option}`)}${available ? '' : `, ${t('settings.comingSoon')}`}`} accessibilityState={{ selected: preference === option, disabled: isSavingTheme || !available }} disabled={isSavingTheme || !available} onPress={() => void chooseTheme(option)} style={({ pressed }) => [styles.themeOption, preference === option && styles.themeOptionSelected, !available && styles.themeOptionUnavailable, pressed && available && styles.optionPressed]}>
                <SymbolView accessible={false} name={option === 'light' ? { ios: 'sun.max.fill', android: 'light_mode', web: 'light_mode' } : option === 'dark' ? { ios: 'moon.fill', android: 'dark_mode', web: 'dark_mode' } : { ios: 'gearshape.fill', android: 'settings', web: 'settings' }} size={22} tintColor={preference === option ? colors.primary : colors.textSecondary} />
                <View style={styles.rowText}><Text style={styles.settingsTitle}>{t(`settings.${option}`)}</Text><Text style={styles.settingsHint}>{t(`settings.${option}Hint`)}</Text></View>
                {preference === option ? <SymbolView accessible={false} name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} size={20} tintColor={colors.primary} /> : null}
                {!available ? <Text style={styles.comingSoon}>{t('settings.comingSoon')}</Text> : null}
              </Pressable>
            })}
            {appearanceError ? <Text accessibilityLiveRegion="polite" style={styles.modalError}>{t('settings.saveError')}</Text> : null}
            <Text style={styles.settingsHint}>{preference === 'system' ? t(resolved === 'dark' ? 'settings.dark' : 'settings.light') : null}</Text>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => { if (!isSavingAvatar) setAvatarPickerVisible(false); }} transparent visible={avatarPickerVisible}>
        <View style={styles.modalBackdrop}>
          <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text accessibilityRole="header" style={styles.sheetTitle}>{t('profile.chooseAvatar')}</Text>
                <Text style={styles.sheetSubtitle}>{t('profile.avatarHint')}</Text>
              </View>
              <Pressable accessibilityLabel={t('profile.closeAvatar')} accessibilityRole="button" disabled={isSavingAvatar} onPress={() => setAvatarPickerVisible(false)} style={styles.closeButton}>
                <SymbolView accessible={false} name={{ ios: 'xmark', android: 'close', web: 'close' }} size={19} tintColor={colors.textSecondary} />
              </Pressable>
            </View>
            {avatarError ? <Text style={styles.modalError}>{t('profile.avatarError')}</Text> : null}
            <ScrollView contentContainerStyle={styles.avatarGrid} showsVerticalScrollIndicator={false}>
              {state.data?.avatars.map((avatar) => (
                <AvatarChoice
                  avatar={avatar}
                  key={avatar.key}
                  onPress={() => setSelectedAvatarKey(avatar.key)}
                  selected={selectedAvatarKey === avatar.key}
                />
              ))}
              {state.data?.avatars.length === 0 ? <Text style={styles.emptyModalText}>{t('profile.noAvatars')}</Text> : null}
            </ScrollView>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: isSavingAvatar || !selectedAvatarKey }} disabled={isSavingAvatar || !selectedAvatarKey} onPress={() => void saveAvatar()} style={[styles.primaryButton, (isSavingAvatar || !selectedAvatarKey) && styles.primaryButtonDisabled]}>
              {isSavingAvatar ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.primaryButtonText}>{t('profile.saveAvatar')}</Text>}
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => { if (!isSavingProfile) setEditVisible(false); }} transparent visible={editVisible}>
        <View style={styles.modalBackdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKeyboard}>
            <SafeAreaView edges={['bottom', 'left', 'right']} style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <View>
                  <Text accessibilityRole="header" style={styles.sheetTitle}>{t('profile.edit')}</Text>
                  <Text style={styles.sheetSubtitle}>{t('profile.editHint')}</Text>
                </View>
                <Pressable accessibilityLabel={t('profile.closeEdit')} accessibilityRole="button" disabled={isSavingProfile} onPress={() => setEditVisible(false)} style={styles.closeButton}>
                  <SymbolView accessible={false} name={{ ios: 'xmark', android: 'close', web: 'close' }} size={19} tintColor={colors.textSecondary} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={styles.editScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={styles.fieldLabel}>{t('profile.birthDate')}</Text>
                <Pressable
                  accessibilityLabel={t('profile.birthDate')}
                  accessibilityRole="button"
                  onPress={openBirthDatePicker}
                  style={({ pressed }) => [styles.dateInput, pressed && styles.optionPressed]}
                >
                  <Text style={[styles.dateInputText, !draftBirthDate && styles.dateInputPlaceholder]}>
                    {formatCivilDateForDisplay(draftBirthDate) ?? t('profile.selectBirthDate')}
                  </Text>
                  <SymbolView accessible={false} name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }} size={18} tintColor={colors.textSecondary} />
                </Pressable>
                {birthDateError ? <Text accessibilityLiveRegion="polite" style={styles.modalError}>{t(birthDateError)}</Text> : null}
                {birthDatePickerVisible ? (
                  <View style={styles.datePickerContainer}>
                    <DateTimePicker
                      display="spinner"
                      maximumDate={getUtcTodayPickerDate()}
                      mode="date"
                      onValueChange={(_event, date) => {
                        setDraftBirthDate(formatCivilDate(date));
                        setBirthDateError(null);
                      }}
                      value={parseCivilDate(draftBirthDate) ?? getUtcTodayPickerDate()}
                    />
                    <Pressable accessibilityRole="button" onPress={() => setBirthDatePickerVisible(false)} style={styles.datePickerDone}>
                      <Text style={styles.datePickerDoneText}>{t('common.done')}</Text>
                    </Pressable>
                  </View>
                ) : null}

                <Text style={styles.fieldLabel}>{t('profile.preferredName')}</Text>
                <TextInput
                  accessibilityLabel={t('profile.preferredName')}
                  autoCapitalize="words"
                  maxLength={100}
                  onChangeText={setDraftName}
                  placeholder={t('profile.namePlaceholder')}
                  placeholderTextColor="#9ca1b2"
                  style={styles.textInput}
                  value={draftName}
                />
                <Text style={styles.fieldHint}>{t('profile.emailHint')}</Text>

                <Text style={styles.fieldLabel}>{t('profile.englishLevel')}</Text>
                <View style={styles.optionsGrid}>
                  {LEVELS.map((value) => <SelectableOption key={value} label={`${value} · ${t(`setup.level.${value}`)}`} onPress={() => setDraftLevel(value)} selected={draftLevel === value} />)}
                </View>

                <Text style={styles.fieldLabel}>{t('profile.learningGoal')}</Text>
                <View style={styles.optionsGrid}>
                  {GOALS.map((value) => <SelectableOption key={value} label={t(`domain.goal.${value}`)} onPress={() => setDraftGoal(value)} selected={draftGoal === value} />)}
                </View>
                {editError ? <Text style={styles.modalError}>{t('profile.saveError')}</Text> : null}
              </ScrollView>
              <View style={styles.modalActions}>
                <Pressable accessibilityRole="button" disabled={isSavingProfile} onPress={() => setEditVisible(false)} style={styles.cancelButton}>
                  <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityState={{ disabled: isSavingProfile }} disabled={isSavingProfile} onPress={() => void saveProfile()} style={styles.primaryButton}>
                  {isSavingProfile ? <ActivityIndicator color="#ffffff" size="small" /> : <Text style={styles.primaryButtonText}>{t('profile.saveChanges')}</Text>}
                </Pressable>
              </View>
            </SafeAreaView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  screen: { backgroundColor: '#f8f9ff', flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: { alignItems: 'center', paddingBottom: 16, paddingHorizontal: 18, paddingTop: 4 },
  content: { maxWidth: 430, width: '100%' },
  profileHeader: { paddingHorizontal: 22, paddingTop: 7 },
  contentHeader: { marginBottom: 4 },
  feedback: { alignItems: 'center', backgroundColor: '#e9f8f0', borderRadius: 10, flexDirection: 'row', marginBottom: 8, paddingHorizontal: 12, paddingVertical: 7 },
  feedbackText: { color: '#2e7658', fontSize: 12, fontWeight: '600', marginLeft: 6 },
  heroCard: { alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12 },
  avatarWrap: { position: 'relative' },
  avatar: { alignItems: 'center', backgroundColor: '#efc49f', borderColor: '#ffffff', borderRadius: 40, borderWidth: 3, height: 80, justifyContent: 'center', overflow: 'hidden', width: 80 },
  avatarImage: { height: '100%', width: '100%' },
  avatarInitial: { color: '#523526', fontSize: 30, fontWeight: '800' },
  cameraButton: { alignItems: 'center', backgroundColor: '#5b50f5', borderColor: '#ffffff', borderRadius: 16, borderWidth: 2, bottom: -2, height: 32, justifyContent: 'center', position: 'absolute', right: -2, width: 32 },
  cameraPressed: { backgroundColor: '#463be0' },
  name: { color: '#171528', fontSize: 18, fontWeight: '800', marginTop: 8 },
  email: { color: '#74798d', fontSize: 12, marginTop: 2 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  sectionTitle: { color: '#171528', fontSize: 15, fontWeight: '700', marginBottom: 5, marginTop: 0 },
  editButton: { alignItems: 'center', flexDirection: 'row', marginBottom: 8, minHeight: 40, paddingHorizontal: 5 },
  editButtonText: { color: '#5b50f5', fontSize: 12, fontWeight: '700', marginLeft: 5 },
  infoCard: { backgroundColor: '#ffffff', borderRadius: 16, paddingHorizontal: 12 },
  profileRow: { alignItems: 'center', flexDirection: 'row', minHeight: 56 },
  rowIcon: { alignItems: 'center', backgroundColor: '#eeeaff', borderRadius: 16, height: 32, justifyContent: 'center', width: 32 },
  rowText: { flex: 1, marginLeft: 10 },
  rowLabel: { color: '#74798d', fontSize: 10, marginBottom: 2 },
  rowValue: { color: '#171528', fontSize: 13, fontWeight: '600' },
  divider: { backgroundColor: '#f0f1f7', height: 1, marginLeft: 42 },
  logoutButton: { alignItems: 'center', borderColor: '#f1a3a8', borderRadius: 13, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', marginTop: 14, minHeight: 48, paddingHorizontal: 18 },
  logoutPressed: { backgroundColor: '#fff1f2' },
  logoutText: { color: '#d95b63', fontSize: 14, fontWeight: '700', marginLeft: 8 },
  centerState: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 28 },
  stateTitle: { color: '#171528', fontSize: 18, fontWeight: '700', marginTop: 14, textAlign: 'center' },
  stateText: { color: '#74798d', fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  errorIcon: { alignItems: 'center', backgroundColor: '#ffe9eb', borderRadius: 28, height: 56, justifyContent: 'center', width: 56 },
  retryButton: { backgroundColor: '#5b50f5', borderRadius: 12, marginTop: 18, minHeight: 46, paddingHorizontal: 20, paddingVertical: 13 },
  retryText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  inlineError: { backgroundColor: '#fff1f2', borderRadius: 12, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 11 },
  inlineErrorText: { color: '#8f3f49', fontSize: 12, lineHeight: 17 },
  inlineRetryText: { color: '#b44752', fontSize: 12, fontWeight: '700', marginTop: 5 },
  modalBackdrop: { backgroundColor: 'rgba(20, 19, 39, 0.32)', flex: 1, justifyContent: 'flex-end' },
  modalKeyboard: { maxHeight: '94%' },
  sheet: { backgroundColor: '#f8f9ff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '100%', paddingHorizontal: 20, paddingTop: 10 },
  sheetHandle: { alignSelf: 'center', backgroundColor: '#d6d8e4', borderRadius: 3, height: 5, marginBottom: 16, width: 42 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  sheetTitle: { color: '#171528', fontSize: 20, fontWeight: '800' },
  sheetSubtitle: { color: '#74798d', fontSize: 12, lineHeight: 17, marginTop: 4, maxWidth: 290 },
  closeButton: { alignItems: 'center', backgroundColor: '#eceef6', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  modalError: { color: '#b44752', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 14 },
  avatarChoice: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: 'transparent', borderRadius: 40, borderWidth: 2, padding: 5 },
  avatarChoiceSelected: { borderColor: '#5b50f5' },
  avatarChoiceImage: { backgroundColor: '#efc49f', borderRadius: 34, height: 68, width: 68 },
  avatarCheck: { alignItems: 'center', backgroundColor: '#5b50f5', borderColor: '#ffffff', borderRadius: 10, borderWidth: 2, height: 20, justifyContent: 'center', position: 'absolute', right: 4, top: 4, width: 20 },
  emptyModalText: { color: '#74798d', fontSize: 13, paddingVertical: 22, textAlign: 'center', width: '100%' },
  primaryButton: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 13, justifyContent: 'center', minHeight: 50, paddingHorizontal: 16 },
  primaryButtonDisabled: { opacity: 0.55 },
  primaryButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  editScroll: { paddingBottom: 14 },
  fieldLabel: { color: '#171528', fontSize: 13, fontWeight: '700', marginBottom: 8, marginTop: 10 },
  fieldHint: { color: '#8a8fa2', fontSize: 11, marginTop: 6 },
  textInput: { backgroundColor: '#ffffff', borderColor: '#e4e6ef', borderRadius: 12, borderWidth: 1, color: '#171528', fontSize: 14, minHeight: 50, paddingHorizontal: 14, paddingVertical: 12 },
  dateInput: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e4e6ef', borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 50, paddingHorizontal: 14 },
  dateInputText: { color: '#171528', fontSize: 14 },
  dateInputPlaceholder: { color: '#9ca1b2' },
  datePickerContainer: { backgroundColor: '#ffffff', borderRadius: 12, marginTop: 8, paddingBottom: 8 },
  datePickerDone: { alignSelf: 'flex-end', minHeight: 40, justifyContent: 'center', paddingHorizontal: 14 },
  datePickerDoneText: { color: '#5147df', fontSize: 13, fontWeight: '700' },
  optionsGrid: { gap: 8 },
  option: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e4e6ef', borderRadius: 11, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 12 },
  optionSelected: { backgroundColor: '#f0eeff', borderColor: '#5b50f5' },
  optionPressed: { opacity: 0.75 },
  optionText: { color: '#4f5364', flex: 1, fontSize: 13 },
  optionTextSelected: { color: '#4d43df', fontWeight: '700' },
  settingsRow: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e4e6ef', borderRadius: 16, borderWidth: 1, flexDirection: 'row', minHeight: 64, paddingHorizontal: 12, marginTop: 4 },
  settingsTitle: { color: '#171528', fontSize: 14, fontWeight: '700' },
  settingsHint: { color: '#74798d', fontSize: 11, marginTop: 3, marginBottom: 4 },
  themeOption: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e4e6ef', borderRadius: 13, borderWidth: 1, flexDirection: 'row', minHeight: 64, marginBottom: 10, paddingHorizontal: 14 },
  themeOptionSelected: { backgroundColor: '#eeecff', borderColor: '#5b50f5' },
  themeOptionUnavailable: { opacity: 0.55 },
  comingSoon: { color: '#74798d', fontSize: 11, fontWeight: '700', marginLeft: 8 },
  modalActions: { borderTopColor: '#e7e8f1', borderTopWidth: 1, flexDirection: 'row', gap: 10, paddingBottom: 8, paddingTop: 12 },
  cancelButton: { alignItems: 'center', borderColor: '#d9dbe6', borderRadius: 13, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 50 },
  cancelButtonText: { color: '#5c6072', fontSize: 14, fontWeight: '700' },
});

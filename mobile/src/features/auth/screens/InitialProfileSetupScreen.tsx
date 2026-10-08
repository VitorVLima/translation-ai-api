import { useThemedStyles } from '../../../theme/useThemedStyles';
import { ArtworkSoftener } from '../../../components/ArtworkSoftener';
import { useTheme } from '../../../theme/ThemeProvider';
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { API_URL } from '../../../config/api';
import { completeInitialSetup as saveInitialSetup, getPredefinedAvatars, skipInitialSetup as skipSetup } from '../../profile/profile.service';
import type { AvatarResponse, EnglishLevel, LearningGoal } from '../../profile/profile.types';
import { formatCivilDate, getUtcTodayPickerDate, isFutureCivilDate, parseCivilDate } from '../../profile/profile.date';
import { useAuthNavigation } from '../auth-navigation';
import { logoutSession } from '../auth.session';
import { useI18n } from '../../../i18n';

const STEPS = ['welcome', 'name', 'about', 'level', 'goal', 'avatar', 'summary'] as const;
const LEVELS: EnglishLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const GOALS: LearningGoal[] = ['GENERAL', 'CONVERSATION', 'WORK', 'TRAVEL', 'STUDY'];
const GOAL_ICONS: Record<LearningGoal, SymbolViewProps['name']> = {
  GENERAL: { ios: 'scope', android: 'my_location', web: 'my_location' },
  CONVERSATION: { ios: 'bubble.left.and.bubble.right.fill', android: 'forum', web: 'forum' },
  WORK: { ios: 'briefcase.fill', android: 'work', web: 'work' },
  TRAVEL: { ios: 'airplane', android: 'flight', web: 'flight' },
  STUDY: { ios: 'graduationcap.fill', android: 'school', web: 'school' },
};

function parseBirthDate(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return formatCivilDate(date);
}

function labelForLevel(level: EnglishLevel, t: ReturnType<typeof useI18n>['t']) {
  return `${level} · ${t(`setup.level.${level}`)}`;
}

function getAvatarImageUrl(avatar: AvatarResponse): string {
  try { return new URL(avatar.imageUrl, `${API_URL}/`).toString(); }
  catch { return avatar.imageUrl; }
}

function SelectOption({ label, description, selected, onPress, symbol, compact }: {
  label: string; description?: string; selected: boolean; onPress: () => void;
  symbol?: SymbolViewProps['name'];
  compact?: boolean;
}) {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={[styles.option, compact && styles.optionCompact, selected && styles.optionSelected]}>
      <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioCenter} /> : null}</View>
      {symbol ? <View style={styles.optionIcon}><SymbolView accessible={false} name={symbol} size={22} tintColor={colors.accentText} /></View> : null}
      <View style={styles.optionText}><Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>{description ? <Text style={styles.optionDescription}>{description}</Text> : null}</View>
    </Pressable>
  );
}

export function InitialProfileSetupScreen() {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  const { profile, completeInitialSetup: completeSetup } = useAuthNavigation();
  const { t } = useI18n();
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 800 && fontScale <= 1.1;
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile?.preferredName ?? '');
  const [nameError, setNameError] = useState('');
  const [birthInput, setBirthInput] = useState(() => profile?.birthDate ? profile.birthDate.split('-').reverse().join('/') : '');
  const [birthError, setBirthError] = useState('');
  const [birthDatePickerVisible, setBirthDatePickerVisible] = useState(false);
  const [level, setLevel] = useState<EnglishLevel | null>(profile?.englishLevel ?? null);
  const [goal, setGoal] = useState<LearningGoal | null>(profile?.learningGoal ?? null);
  const [avatars, setAvatars] = useState<AvatarResponse[]>([]);
  const [avatarKey, setAvatarKey] = useState<string | null>(profile?.avatarKey && profile.avatarKey !== 'avatar_default' ? profile.avatarKey : null);
  const [avatarsLoading, setAvatarsLoading] = useState(true);
  const [avatarCatalogError, setAvatarCatalogError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    getPredefinedAvatars(controller.signal).then((items) => {
      if (!active) return;
      const choices = items.filter((item) => item.key !== 'avatar_default');
      setAvatars(choices);
      if (profile?.avatarKey && choices.some((item) => item.key === profile.avatarKey)) setAvatarKey(profile.avatarKey);
      setAvatarCatalogError(false);
    }).catch(() => { if (active) setAvatarCatalogError(true); }).finally(() => { if (active) setAvatarsLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [profile?.avatarKey]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (busyRef.current) return true;
      if (step > 0) setStep((current) => Math.max(0, current - 1));
      return true;
    });
    return () => subscription.remove();
  }, [step]);

  const parsedBirthDate = parseBirthDate(birthInput);
  const canContinue = step === 1 ? !!name.trim() && name.trim().length <= 100 : step === 2 ? !!parsedBirthDate && !isFutureCivilDate(parsedBirthDate) : step === 3 ? !!level : step === 4 ? !!goal : step === 5 ? !!avatarKey : true;
  function advance() {
    if (step === 1 && (!name.trim() || name.trim().length > 100)) { setNameError(t('setup.nameRequired')); return; }
    if (step === 2) {
      const parsed = parseBirthDate(birthInput);
      if (!parsed) { setBirthError(t('setup.birthDateRequired')); return; }
      if (isFutureCivilDate(parsed)) { setBirthError(t('setup.birthDateFuture')); return; }
    }
    if (step < STEPS.length - 1) setStep((current) => current + 1);
  }

  async function save() {
    if (busyRef.current || !level || !goal || !avatarKey) return;
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 100) { setStep(1); setNameError(t('setup.nameRequired')); return; }
    const birthDate = parseBirthDate(birthInput);
    if (!birthDate) { setStep(2); setBirthError(t('setup.birthDateRequired')); return; }
    if (isFutureCivilDate(birthDate)) { setStep(2); setBirthError(t('setup.birthDateFuture')); return; }
    busyRef.current = true; setSaving(true); setError('');
    try {
      const saved = await saveInitialSetup({ name: trimmedName, birthDate, englishLevel: level, learningGoal: goal, avatarKey });
      completeSetup(saved);
      router.replace('/');
    } catch {
      setError(t('setup.saveError'));
    } finally { busyRef.current = false; setSaving(false); }
  }

  async function signOut() {
    if (busyRef.current) return;
    await logoutSession();
  }

  async function skip() {
    if (busyRef.current) return;
    busyRef.current = true; setSaving(true); setError('');
    try {
      const saved = await skipSetup();
      completeSetup(saved);
      router.replace('/');
    } catch {
      setError(t('setup.skipError'));
    } finally { busyRef.current = false; setSaving(false); }
  }

  function confirmSkip() {
    if (busyRef.current) return;
    Alert.alert(t('setup.skipTitle'), t('setup.skipDescription'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('setup.skipConfirm'), style: 'destructive', onPress: () => { void skip(); } },
    ]);
  }

  function retryAvatarCatalog() {
    if (avatarsLoading) return;
    setAvatarsLoading(true);
    setAvatarCatalogError(false);
    getPredefinedAvatars().then((items) => {
      const choices = items.filter((item) => item.key !== 'avatar_default');
      setAvatars(choices);
      setAvatarCatalogError(false);
    }).catch(() => setAvatarCatalogError(true)).finally(() => setAvatarsLoading(false));
  }

  function openBirthDatePicker() {
    setBirthError('');
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        maximumDate: getUtcTodayPickerDate(),
        mode: 'date',
        onValueChange: (_event, date) => {
          if (date) setBirthInput(formatCivilDate(date).split('-').reverse().join('/'));
        },
        value: parseCivilDate(parseBirthDate(birthInput)) ?? getUtcTodayPickerDate(),
      });
      return;
    }
    setBirthDatePickerVisible(true);
  }

  function updateBirthDate(date: Date) {
    setBirthInput(formatCivilDate(date).split('-').reverse().join('/'));
    setBirthError('');
  }

  const stepName = STEPS[step];
  const stepTitle = stepName === 'welcome' ? t('setup.welcome.title') : stepName === 'name' ? t('setup.name.title') : stepName === 'about' ? t('setup.about.title') : stepName === 'level' ? t('setup.level.title') : stepName === 'goal' ? t('setup.goals.title') : stepName === 'avatar' ? t('setup.avatar.title') : t('setup.summary.title');
  const stepDescription = stepName === 'welcome' ? t('setup.welcome.description') : stepName === 'name' ? t('setup.name.description') : stepName === 'about' ? t('setup.about.description') : stepName === 'level' ? t('setup.level.description') : stepName === 'goal' ? t('setup.goals.description') : stepName === 'avatar' ? t('setup.avatar.description') : t('setup.summary.description');
  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.safeArea}>
      <StatusBar style="auto" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.header}>
          <View style={styles.brand}><Image accessible={false} source={require('../../../../assets/icon.png')} style={styles.brandIcon} /><Text style={styles.brandText}>English<Text style={styles.brandAccent}>AI</Text></Text></View>
          <View style={styles.headerActions}><Pressable accessibilityRole="button" accessibilityLabel={t('setup.skip')} disabled={saving} onPress={confirmSkip} style={styles.skipButton}><Text style={styles.skipText}>{t('setup.skip')}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={t('setup.logout')} disabled={saving} onPress={() => void signOut()} style={styles.logoutButton}><Text style={styles.logoutText}>{t('setup.logout')}</Text></Pressable></View>
        </View>
        <View accessibilityLabel={t('setup.step', { current: step + 1, total: STEPS.length })} style={styles.progressHeader}>
          {STEPS.map((name, index) => <View key={name} style={[styles.progressPiece, index === STEPS.length - 1 && styles.progressLast]}>
            <View style={[styles.progressDot, index < step && styles.progressDotDone, index === step && styles.progressDotCurrent]} />
            {index < STEPS.length - 1 ? <View style={[styles.progressLine, index < step && styles.progressLineDone]} /> : null}
          </View>)}
        </View>
        <ScrollView contentContainerStyle={[styles.scrollContent, compact && styles.scrollContentCompact, stepName === 'welcome' && styles.welcomeScroll]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={[styles.content, stepName === 'welcome' && styles.welcomeContent]}>
            <Text accessibilityRole="header" style={[styles.title, compact && styles.titleCompact]}>{stepTitle}</Text>
            <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>{stepDescription}</Text>
            {stepName === 'welcome' ? <View style={[styles.heroFrame, compact && styles.heroFrameCompact]}><Image accessible accessibilityLabel={t('setup.welcome.robot')} source={require('../../../../assets/robo-onboarding.png')} resizeMode="contain" style={[styles.heroImage, { height: Math.min(310, Math.max(180, height * 0.33)) }]} /><ArtworkSoftener /></View> : null}
            {stepName === 'name' ? <View style={[styles.fieldBlock, compact && styles.fieldBlockCompact]}>
              <View style={[styles.dateCard, styles.nameCard, nameError && styles.inputError]}><View style={[styles.dateIcon, styles.nameIcon]}><SymbolView accessible={false} name={{ ios: 'person.fill', android: 'person', web: 'person' }} size={20} tintColor={colors.accentText} /></View><View style={[styles.dateField, styles.nameField]}><Text style={styles.fieldLabel}>{t('setup.name.label')}</Text><TextInput accessibilityLabel={t('setup.name.label')} autoCapitalize="words" autoComplete="name" maxLength={100} onChangeText={(value) => { setName(value); setNameError(''); }} placeholder={t('setup.name.placeholder')} placeholderTextColor={colors.placeholder} style={styles.nameTextInput} value={name} /></View></View>
              {nameError ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{nameError}</Text> : null}
            </View> : null}
            {stepName === 'about' ? <View style={[styles.fieldBlock, compact && styles.fieldBlockCompact]}>
              <Pressable accessibilityRole="button" accessibilityLabel={t('setup.birthDate')} onPress={openBirthDatePicker} style={({ pressed }) => [styles.dateCard, birthError && styles.inputError, pressed && styles.dateCardPressed]}><View style={styles.dateIcon}><SymbolView accessible={false} name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }} size={22} tintColor={colors.accentText} /></View><View style={styles.dateField}><Text style={styles.fieldLabel}>{t('setup.birthDate')}</Text><Text style={[styles.textInput, !birthInput && styles.birthDatePlaceholder]}>{birthInput || 'DD/MM/AAAA'}</Text></View><SymbolView accessible={false} name={{ ios: 'chevron.down', android: 'arrow_drop_down', web: 'arrow_drop_down' }} size={20} tintColor="#8794b3" /></Pressable>
              {birthDatePickerVisible ? <View style={styles.datePickerContainer}><DateTimePicker display="spinner" maximumDate={getUtcTodayPickerDate()} mode="date" onValueChange={(_event, date) => updateBirthDate(date)} value={parseCivilDate(parseBirthDate(birthInput)) ?? getUtcTodayPickerDate()} /><Pressable accessibilityRole="button" onPress={() => setBirthDatePickerVisible(false)} style={styles.datePickerDone}><Text style={styles.datePickerDoneText}>{t('common.done')}</Text></Pressable></View> : null}
              <Text style={styles.fieldHint}>{t('setup.birthDateHint')}</Text><View style={styles.note}><SymbolView accessible={false} name={{ ios: 'info.circle', android: 'info', web: 'info' }} size={17} tintColor="#8794b3" /><Text style={styles.noteText}>{t('setup.birthDateNote')}</Text></View>
              {birthError ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{birthError}</Text> : null}
            </View> : null}
            {stepName === 'level' ? <View style={[styles.options, compact && styles.optionsCompact]}>{LEVELS.map((value) => <SelectOption key={value} label={labelForLevel(value, t)} description={compact ? undefined : t(`setup.levelDescription.${value}`)} symbol={{ ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' }} compact={compact} selected={level === value} onPress={() => setLevel(value)} />)}</View> : null}
            {stepName === 'goal' ? <View style={[styles.options, compact && styles.optionsCompact]}>{GOALS.map((value) => <SelectOption key={value} label={t(`setup.goal.${value}`)} description={t(`setup.goalDescription.${value}`)} symbol={GOAL_ICONS[value]} compact={compact} selected={goal === value} onPress={() => setGoal(value)} />)}</View> : null}
            {stepName === 'avatar' ? <View style={styles.avatarSection}>
              {avatarsLoading ? <Text style={styles.fieldHint}>{t('setup.avatar.loading')}</Text> : null}
              {avatarCatalogError ? <View style={styles.avatarError}><Text style={styles.errorText}>{t('setup.avatar.loadError')}</Text><Pressable accessibilityRole="button" onPress={retryAvatarCatalog} style={styles.avatarRetry}><Text style={styles.avatarRetryText}>{t('common.retry')}</Text></Pressable></View> : null}
              {!avatarsLoading && !avatarCatalogError ? <View style={styles.avatarGrid}>{avatars.map((avatar) => {
                const selected = avatarKey === avatar.key;
                return <Pressable key={avatar.key} accessibilityRole="radio" accessibilityLabel={avatar.displayName} accessibilityState={{ selected }} onPress={() => setAvatarKey(avatar.key)} style={({ pressed }) => [styles.avatarChoice, selected && styles.avatarChoiceSelected, pressed && styles.avatarChoicePressed]}>
                  <Image accessibilityIgnoresInvertColors source={{ uri: getAvatarImageUrl(avatar) }} style={styles.avatarImage} />
                  {selected ? <View style={styles.avatarSelectedMark}><SymbolView accessible={false} name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={14} tintColor="#fff" /></View> : null}
                </Pressable>;
              })}</View> : null}
              {!avatarKey && !avatarsLoading && !avatarCatalogError ? <Text style={styles.fieldHint}>{t('setup.avatar.required')}</Text> : null}
            </View> : null}
            {stepName === 'summary' ? <View style={styles.summaryCard}>
              {name.trim() ? <SummaryRow label={t('setup.summary.name')} value={name.trim()} /> : null}
              {parsedBirthDate ? <SummaryRow label={t('setup.summary.birthDate')} value={birthInput} /> : null}
              {level ? <SummaryRow label={t('setup.summary.level')} value={labelForLevel(level, t)} /> : null}
              {goal ? <SummaryRow label={t('setup.summary.goal')} value={t(`setup.goal.${goal}`)} /> : null}
              {avatarKey ? <View style={styles.summaryAvatar}><Text style={styles.summaryLabel}>{t('setup.summary.avatar')}</Text><Image accessibilityLabel={t('setup.summary.avatar')} source={{ uri: getAvatarImageUrl(avatars.find((item) => item.key === avatarKey) ?? { key: avatarKey, displayName: avatarKey, imageUrl: `/api/v1/avatars/${avatarKey}/image` }) }} style={styles.summaryAvatarImage} /></View> : null}
            </View> : null}
            {error ? <Text accessibilityLiveRegion="polite" style={styles.errorText}>{error}</Text> : null}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          {step < STEPS.length - 1 ? <View style={styles.actions}>
            {step > 0 ? <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} disabled={saving} onPress={() => setStep((current) => Math.max(0, current - 1))} style={styles.secondaryButton}><SymbolView accessible={false} name={{ ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }} size={21} tintColor={colors.text} /></Pressable> : null}
            <Pressable accessibilityRole="button" disabled={!canContinue || saving} onPress={advance} style={[styles.primaryButton, step === 0 && styles.welcomeButton, (!canContinue || saving) && styles.disabled]}><Text style={styles.primaryText}>{t('common.next')}</Text><SymbolView accessible={false} name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} size={18} tintColor="#fff" /></Pressable>
          </View> : <View style={styles.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} disabled={saving} onPress={() => setStep((current) => Math.max(0, current - 1))} style={styles.secondaryButton}><SymbolView accessible={false} name={{ ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }} size={21} tintColor={colors.text} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ busy: saving, disabled: saving }} disabled={saving} onPress={() => void save()} style={[styles.primaryButton, saving && styles.disabled]}><Text style={styles.primaryText}>{saving ? t('common.saving') : t('setup.start')}</Text></Pressable>
          </View>}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(baseStyles);
  return <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>;
}

const baseStyles = StyleSheet.create({
  safeArea: { backgroundColor: '#fff', flex: 1 },
  flex: { flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 64, paddingHorizontal: 18 },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  brand: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  brandIcon: { borderRadius: 13, height: 44, width: 44 },
  brandText: { color: '#141326', fontSize: 30, fontWeight: '800' },
  brandAccent: { color: '#6c44f5' },
  logoutButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 6 },
  logoutText: { color: '#697895', fontSize: 12, fontWeight: '600' },
  skipButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 },
  skipText: { color: '#4b4edb', fontSize: 13, fontWeight: '700' },
  progressHeader: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', maxWidth: 290, paddingHorizontal: 24, paddingTop: 8, width: '100%' },
  progressPiece: { alignItems: 'center', flex: 1, flexDirection: 'row' },
  progressLast: { flex: 0 },
  progressDot: { backgroundColor: '#fff', borderColor: '#c8d2e7', borderRadius: 10, borderWidth: 2, height: 11, width: 11 },
  progressDotDone: { backgroundColor: '#7779ea', borderColor: '#7779ea' },
  progressDotCurrent: { backgroundColor: '#4545d8', borderColor: '#4545d8', height: 15, width: 15 },
  progressLine: { backgroundColor: '#d5ddec', flex: 1, height: 2, marginHorizontal: 2 },
  progressLineDone: { backgroundColor: '#7779ea' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 25, paddingBottom: 12, paddingTop: 20 },
  scrollContentCompact: { paddingBottom: 8, paddingTop: 12 },
  welcomeScroll: { justifyContent: 'space-between' },
  content: { alignSelf: 'center', maxWidth: 460, width: '100%' },
  welcomeContent: { flex: 1 },
  title: { color: '#101e3e', fontSize: 30, fontWeight: '800', letterSpacing: -0.7, lineHeight: 37 },
  titleCompact: { fontSize: 27, lineHeight: 33 },
  subtitle: { color: '#4e5c78', fontSize: 15, lineHeight: 22, marginTop: 9 },
  subtitleCompact: { fontSize: 14, lineHeight: 20, marginTop: 7 },
  heroFrame: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#e1e7f2', borderRadius: 22, borderWidth: 1, flex: 1, justifyContent: 'center', marginTop: 12, minHeight: 180, overflow: 'hidden' },
  heroFrameCompact: { marginTop: 6, minHeight: 150 },
  heroImage: { maxHeight: '100%', width: '100%' },
  fieldBlock: { marginTop: 32 },
  fieldBlockCompact: { marginTop: 24 },
  dateCard: { alignItems: 'center', backgroundColor: '#f5f7fc', borderColor: '#e1e7f2', borderRadius: 17, borderWidth: 1, flexDirection: 'row', gap: 13, minHeight: 84, paddingHorizontal: 15, shadowColor: '#20305f', shadowOpacity: 0.04, shadowRadius: 10, elevation: 2 },
  dateCardPressed: { opacity: 0.82 },
  nameCard: { minHeight: 66, paddingVertical: 4 },
  nameIcon: { height: 40, width: 40 },
  nameField: { paddingVertical: 8 },
  dateIcon: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, height: 45, justifyContent: 'center', width: 45 },
  dateField: { flex: 1, paddingVertical: 13 },
  fieldLabel: { color: '#63708b', fontSize: 12, fontWeight: '600' },
  textInput: { color: '#152244', fontSize: 20, fontWeight: '700', minHeight: 35, padding: 0 },
  nameTextInput: { color: '#152244', fontSize: 16, fontWeight: '600', minHeight: 32, padding: 0 },
  birthDatePlaceholder: { color: '#9da7bd' },
  datePickerContainer: { alignItems: 'center', backgroundColor: '#f8f9ff', borderColor: '#e1e7f2', borderRadius: 16, borderWidth: 1, marginTop: 12, overflow: 'hidden', padding: 8 },
  datePickerDone: { alignSelf: 'flex-end', minHeight: 42, justifyContent: 'center', paddingHorizontal: 14 },
  datePickerDoneText: { color: '#4145d4', fontSize: 14, fontWeight: '700' },
  avatarSection: { marginTop: 24 },
  avatarGrid: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  avatarChoice: { alignItems: 'center', aspectRatio: 1, backgroundColor: '#f5f7fc', borderColor: '#e1e7f2', borderRadius: 20, borderWidth: 2, justifyContent: 'center', maxWidth: 112, minHeight: 88, minWidth: 88, overflow: 'hidden', width: '30%' },
  avatarChoiceSelected: { backgroundColor: '#f1f0ff', borderColor: '#5148df' },
  avatarChoicePressed: { opacity: 0.78 },
  avatarImage: { height: '82%', width: '82%' },
  avatarSelectedMark: { alignItems: 'center', backgroundColor: '#5148df', borderColor: '#fff', borderRadius: 11, borderWidth: 2, height: 23, justifyContent: 'center', position: 'absolute', right: 4, top: 4, width: 23 },
  avatarError: { alignItems: 'center', gap: 8 },
  avatarRetry: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 10 },
  avatarRetryText: { color: '#4145d4', fontSize: 14, fontWeight: '700' },
  inputError: { borderColor: '#b42336' },
  fieldHint: { color: '#8390a9', fontSize: 12, marginTop: 9 },
  note: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, marginTop: 28, paddingHorizontal: 5 },
  noteText: { color: '#71809d', flex: 1, fontSize: 13, lineHeight: 19 },
  errorText: { color: '#b42336', fontSize: 13, lineHeight: 19, marginTop: 13 },
  options: { gap: 8, marginTop: 18 },
  optionsCompact: { gap: 6, marginTop: 12 },
  option: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#e0e7f2', borderRadius: 15, borderWidth: 1, flexDirection: 'row', gap: 12, minHeight: 66, paddingHorizontal: 13, paddingVertical: 8, shadowColor: '#172c55', shadowOpacity: 0.03, shadowRadius: 7, elevation: 1 },
  optionCompact: { minHeight: 52, paddingVertical: 6 },
  optionSelected: { backgroundColor: '#f5f6ff', borderColor: '#5754e9', borderWidth: 1.5 },
  radio: { alignItems: 'center', borderColor: '#aebbd2', borderRadius: 12, borderWidth: 1.7, height: 21, justifyContent: 'center', width: 21 },
  radioSelected: { borderColor: '#4b4bdc', borderWidth: 6 },
  radioCenter: { backgroundColor: '#fff', borderRadius: 5, height: 7, width: 7 },
  optionIcon: { alignItems: 'center', justifyContent: 'center', width: 33 },
  optionText: { flex: 1 },
  optionLabel: { color: '#142246', fontSize: 15, fontWeight: '700' },
  optionLabelSelected: { color: '#3538ae' },
  optionDescription: { color: '#687895', fontSize: 11, lineHeight: 15, marginTop: 2 },
  summaryCard: { backgroundColor: '#f8f9ff', borderColor: '#e4e7f8', borderRadius: 19, borderWidth: 1, gap: 20, marginTop: 32, padding: 22 },
  summaryRow: { gap: 5 },
  summaryValue: { color: '#17264c', fontSize: 16, fontWeight: '700' },
  summaryLabel: { color: '#73809d', fontSize: 12, fontWeight: '600' },
  summaryAvatar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  summaryAvatarImage: { borderRadius: 24, height: 52, width: 52 },
  footer: { backgroundColor: '#fff', borderTopColor: '#f1f3f9', borderTopWidth: 1, paddingBottom: 8, paddingHorizontal: 24, paddingTop: 8 },
  actions: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  secondaryButton: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#d5deee', borderRadius: 13, borderWidth: 1, height: 50, justifyContent: 'center', width: 50 },
  primaryButton: { alignItems: 'center', backgroundColor: '#4145d4', borderRadius: 13, flex: 1, flexDirection: 'row', gap: 9, justifyContent: 'center', minHeight: 50, paddingHorizontal: 14 },
  welcomeButton: { flex: 1 },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.48 },
});

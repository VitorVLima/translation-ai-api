import { useThemedStyles } from '../../../theme/useThemedStyles';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DailyGoal } from '../../progress/progress.types';
import { getDailyGoalMessage } from '../home.presentation';
import { useI18n } from '../../../i18n';

type HomeDailyGoalCardProps = {
  goal: DailyGoal | null;
  status: 'loading' | 'success' | 'error';
  onRetry: () => void;
  onVocabularyPress: () => void;
  onConversationPress: () => void;
  onReadingPress: () => void;
};

type GoalKey = 'vocabulary' | 'conversation' | 'reading';

export function HomeDailyGoalCard({ goal, status, onRetry, onVocabularyPress, onConversationPress, onReadingPress }: HomeDailyGoalCardProps) {
  const styles = useThemedStyles(baseStyles);
  const { t } = useI18n();
  const labels: Record<GoalKey, string> = { vocabulary: t('home.activity.vocabulary'), conversation: t('home.activity.conversation'), reading: t('home.activity.reading') };
  const actions: Record<GoalKey, () => void> = {
    vocabulary: onVocabularyPress,
    conversation: onConversationPress,
    reading: onReadingPress,
  };
  const keys: GoalKey[] = ['vocabulary', 'conversation', 'reading'];

  return (
    <View style={styles.section}>
      <View style={styles.heading}>
        <View style={styles.headingTitle}>
          <View style={styles.iconCircle}><SymbolView accessible={false} name={{ ios: 'calendar', android: 'today', web: 'today' }} size={17} tintColor="#5147df" /></View>
          <Text style={styles.title}>{t('home.dailyGoal')}</Text>
        </View>
        {status === 'success' && goal ? <Text style={styles.counter}>{t('home.dailyGoal.counter', { done: goal.completed, total: goal.total })} →</Text> : null}
      </View>
      {status === 'loading' ? (
        <View accessibilityLiveRegion="polite" accessibilityRole="progressbar" style={styles.loading}><ActivityIndicator color="#5b50f5" /><Text style={styles.muted}>{t('home.dailyGoalLoading')}</Text></View>
      ) : null}
      {status === 'error' ? (
        <View style={styles.error}><Text style={styles.errorText}>{t('home.dailyGoalError')}</Text><Pressable accessibilityRole="button" onPress={onRetry}><Text style={styles.retryText}>{t('common.retry')}</Text></Pressable></View>
      ) : null}
      {status === 'success' && goal ? (
        <>
          <View style={styles.items}>
            {keys.map((key) => {
              const done = goal[key].completed;
              return (
                <Pressable accessibilityLabel={`${labels[key]}: ${done ? t('home.done') : t('home.pending')}`} accessibilityRole="button" accessibilityState={{ disabled: done }} disabled={done} key={key} onPress={actions[key]} style={[styles.item, done && styles.itemDone]}>
                  <View style={[styles.check, done && styles.checkDone]}><SymbolView accessible={false} name={{ ios: done ? 'checkmark' : 'circle', android: done ? 'check' : 'radio_button_unchecked', web: done ? 'check' : 'radio_button_unchecked' }} size={17} tintColor={done ? '#ffffff' : '#5b50f5'} /></View>
                  <Text style={styles.itemLabel}>{labels[key]}</Text>
                  <Text style={styles.itemState}>{done ? t('home.done') : t('home.pending')}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={[styles.message, goal.goalCompleted && styles.messageComplete]}>
            <SymbolView accessible={false} name={{ ios: goal.goalCompleted ? 'checkmark.seal.fill' : 'target', android: goal.goalCompleted ? 'celebration' : 'track_changes', web: goal.goalCompleted ? 'celebration' : 'track_changes' }} size={22} tintColor={goal.goalCompleted ? '#188451' : '#e56a45'} />
            <View style={styles.messageText}><Text style={[styles.messageTitle, goal.goalCompleted && styles.messageTitleComplete]}>{goal.goalCompleted ? t('home.dailyGoalComplete') : getDailyGoalMessage(goal)}</Text>{goal.goalCompleted ? <Text style={styles.messageDetail}>{t('home.dailyGoal.allDone')}</Text> : null}</View>
          </View>
        </>
      ) : null}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  section: { marginTop: 17 },
  heading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  headingTitle: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  iconCircle: { alignItems: 'center', backgroundColor: '#efedff', borderRadius: 9, height: 28, justifyContent: 'center', width: 28 },
  title: { color: '#171528', fontSize: 16, fontWeight: '800' },
  counter: { color: '#5147df', fontSize: 11, fontWeight: '800' },
  loading: { alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 15, flexDirection: 'row', gap: 9, minHeight: 82, paddingHorizontal: 15 },
  muted: { color: '#676c81', fontSize: 12 },
  error: { backgroundColor: '#fff3f3', borderRadius: 15, gap: 7, minHeight: 82, justifyContent: 'center', paddingHorizontal: 15 },
  errorText: { color: '#8b4451', fontSize: 12 },
  retryText: { color: '#5147df', fontSize: 11.5, fontWeight: '700' },
  items: { flexDirection: 'row', gap: 7 },
  item: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e8eaf2', borderRadius: 13, borderWidth: 1, flex: 1, minHeight: 93, paddingHorizontal: 4, paddingVertical: 10 },
  itemDone: { backgroundColor: '#effaf4', borderColor: '#d9f1e3' },
  check: { alignItems: 'center', borderColor: '#5b50f5', borderRadius: 15, borderWidth: 2, height: 27, justifyContent: 'center', width: 27 },
  checkDone: { backgroundColor: '#1c9b60', borderColor: '#1c9b60' },
  itemLabel: { color: '#171528', fontSize: 10.5, fontWeight: '800', marginTop: 7, textAlign: 'center' },
  itemState: { color: '#6f7487', fontSize: 10, marginTop: 3, textAlign: 'center' },
  message: { alignItems: 'center', backgroundColor: '#f4f2ff', borderRadius: 13, flexDirection: 'row', gap: 10, marginTop: 8, minHeight: 58, paddingHorizontal: 13, paddingVertical: 9 },
  messageComplete: { backgroundColor: '#effaf4' },
  messageText: { flex: 1 },
  messageTitle: { color: '#37306f', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  messageTitleComplete: { color: '#167344' },
  messageDetail: { color: '#347254', fontSize: 10.5, lineHeight: 15, marginTop: 2 },
});

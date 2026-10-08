import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageLoading } from '../../../components/PageLoading';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { useDeterministicBack } from '../../../hooks/use-deterministic-back';
import { getBackDestination } from '../../../navigation/back-destinations';
import { ActivityEvolutionChart, EmptyChart, PerformanceEvolutionChart, ScoreProgressBar, VocabularyDistributionChart } from '../components/ProgressCharts';
import { formatProgressScore, getProgressDifficultyLabel, PROGRESS_PERIOD_OPTIONS, WEEKDAY_LABELS } from '../progress.presentation';
import { getProgressDashboard, getProgressTimeline } from '../progress.service';
import type {
  ConversationDifficultyProgress,
  ProgressDashboard,
  ProgressPeriod,
  ProgressTimelinePoint,
  ReadingDifficultyProgress,
  WeeklyGoals,
} from '../progress.types';

type ProgressState = {
  data: ProgressDashboard | null;
  error: boolean;
  loading: boolean;
  timeline: ProgressTimelinePoint[] | null;
  timelineError: boolean;
};

const INITIAL_STATE: ProgressState = { data: null, error: false, loading: true, timeline: null, timelineError: false };

export function ProgressScreen() {
  const styles = useThemedStyles(baseStyles);
  const [period, setPeriod] = useState<ProgressPeriod>('ALL_TIME');
  const [state, setState] = useState<ProgressState>(INITIAL_STATE);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const versionRef = useRef(0);
  const stateRef = useRef(INITIAL_STATE);
  const mountedRef = useRef(true);
  useEffect(() => { stateRef.current = state; }, [state]);
  const goHome = useCallback(() => router.replace(getBackDestination('progress')), []);
  useDeterministicBack(goHome);

  const load = useCallback(async (preserveCurrent: boolean) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    const version = ++versionRef.current;
    requestRef.current = controller;
    const hasCompleteData = stateRef.current.data !== null && stateRef.current.timeline !== null;
    setState((current) => ({
      data: preserveCurrent ? current.data : null,
      error: false,
      loading: true,
      timeline: preserveCurrent ? current.timeline : null,
      timelineError: false,
    }));
    const [dashboardResult, timelineResult] = await Promise.allSettled([
      getProgressDashboard(period, controller.signal),
      getProgressTimeline(controller.signal),
    ]);
    if (controller.signal.aborted || version !== versionRef.current || !mountedRef.current) return;
    if (dashboardResult.status === 'rejected' || timelineResult.status === 'rejected') {
      if (!hasCompleteData) setState({ data: null, error: true, loading: false, timeline: null, timelineError: true });
      else setState((current) => ({ ...current, error: true, loading: false, timelineError: timelineResult.status === 'rejected' }));
      if (requestRef.current === controller) requestRef.current = null;
      return;
    }
    setState({
      data: dashboardResult.value,
      error: false,
      loading: false,
      timeline: timelineResult.value.points,
      timelineError: false,
    });
    if (requestRef.current === controller) requestRef.current = null;
  }, [period]);

  useFocusEffect(useCallback(() => {
    mountedRef.current = true;
    setIsRefreshing(false);
    void load(true);
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      requestRef.current = null;
      versionRef.current += 1;
    };
  }, [load]));

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try { await load(true); } finally { if (mountedRef.current) setIsRefreshing(false); }
  }, [load]);

  const data = state.data;
  if (state.loading && (!data || !state.timeline)) return <PageLoading label="Carregando seu progresso..." onBack={goHome} title="Meu progresso" />;
  if (state.error && (!data || !state.timeline)) return <FullError onBack={goHome} onRetry={() => void load(true)} />;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}><ScreenHeader onBack={goHome} title="Meu progresso" /></View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl colors={['#5b50f5']} onRefresh={() => void refresh()} refreshing={isRefreshing} tintColor="#5b50f5" />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.intro}>
          <Text accessibilityRole="header" style={styles.introTitle}>Progresso</Text>
          <Text style={styles.introSubtitle}>Acompanhe sua evolução no inglês.</Text>
        </View>

        {data ? (
          <>
            {state.error ? <InlineNotice message="Não foi possível atualizar os dados. O último resultado disponível continua visível." /> : null}

            <SectionHeading icon={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }} title="Metas diárias da semana" />
            <WeeklyGoalsCard goals={data.weeklyGoals} today={data.dailyGoal.date} />

            <SectionHeading icon={{ ios: 'square.grid.2x2.fill', android: 'grid_view', web: 'grid_view' }} title="Visão geral" />
            <PeriodPicker onChange={setPeriod} selected={period} />
            <View style={styles.metricGrid}>
              <MetricCard color="#6b5cff" label="Palavras encontradas" value={data.overview.wordsFirstSeen} />
              <MetricCard color="#6254df" label="Conversas avaliadas" value={data.overview.conversationsCompleted} />
              <MetricCard color="#35a7d7" label="Leituras concluídas" value={data.overview.readingsCompleted} />
              <MetricCard color="#2da66f" label="Metas nesta semana" value={data.weeklyGoals.completedDays} suffix={`/${data.weeklyGoals.totalDays}`} />
            </View>

            <SectionHeading icon={{ ios: 'chart.xyaxis.line', android: 'show_chart', web: 'show_chart' }} subtitle="Atividades reais dos últimos seis meses." title="Evolução" />
            <View style={styles.card}>
              {!state.timeline
                ? <EmptyChart message="Não foi possível carregar a evolução agora. As demais métricas continuam disponíveis." />
                : <ActivityEvolutionChart points={state.timeline} />}
            </View>

            <SectionHeading icon={{ ios: 'gauge.with.dots.needle.67percent', android: 'speed', web: 'speed' }} subtitle="Médias de avaliações concluídas." title="Desempenho" />
            <View style={styles.card}>
              <View style={styles.scoreSummary}>
                <ScoreSummary label="Conversação" value={data.conversation.averageOverall} />
                <View style={styles.verticalDivider} />
                <ScoreSummary label="Leitura" value={data.reading.averageComprehension} />
              </View>
              <View style={styles.cardDivider} />
              {!state.timeline
                ? <EmptyChart message="O histórico de notas não pôde ser carregado agora." />
                : <PerformanceEvolutionChart points={state.timeline} />}
            </View>

            <SectionHeading icon={{ ios: 'text.book.closed.fill', android: 'menu_book', web: 'menu_book' }} title="Vocabulário" />
            <View style={styles.card}>
              <View style={styles.compactMetrics}>
                <CompactMetric label="Total" value={data.vocabulary.totalWords} />
                <CompactMetric label="Dominadas" value={data.vocabulary.masteredCount} />
                <CompactMetric label="Para revisar" value={data.vocabulary.dueForReview} />
              </View>
              <View style={styles.cardDivider} />
              <VocabularyDistributionChart vocabulary={data.vocabulary} />
              {period !== 'ALL_TIME' ? (
                <Text style={styles.periodDetail}>{data.vocabulary.wordsFirstSeenInPeriod} encontradas e {data.vocabulary.wordsReviewedInPeriod} revisadas no período.</Text>
              ) : null}
            </View>

            <SectionHeading icon={{ ios: 'bubble.left.and.bubble.right.fill', android: 'forum', web: 'forum' }} title="Conversação" />
            <View style={styles.card}>
              {data.conversation.totalEvaluated === 0 ? (
                <EmptyChart message="Conclua e avalie conversas para acompanhar seu desempenho." />
              ) : (
                <>
                  <View style={styles.compactMetrics}>
                    <CompactMetric label="Avaliadas" value={data.conversation.totalEvaluated} />
                    <CompactMetric label="Satisfatórias" value={data.conversation.successCount} />
                    <CompactMetric label="Taxa de sucesso" value={data.conversation.successRate} percent />
                  </View>
                  <View style={styles.cardDivider} />
                  <Text style={styles.cardSubtitle}>Médias por competência</Text>
                  <View style={styles.scoreBars}>
                    <ScoreProgressBar label="Comunicação" value={data.conversation.averageCommunication} />
                    <ScoreProgressBar label="Gramática" value={data.conversation.averageGrammar} />
                    <ScoreProgressBar label="Vocabulário" value={data.conversation.averageVocabulary} />
                    <ScoreProgressBar label="Fluência" value={data.conversation.averageFluency} />
                    <ScoreProgressBar label="Relevância" value={data.conversation.averageRelevance} />
                  </View>
                  <DifficultyConversation rows={data.conversation.byDifficulty} />
                </>
              )}
            </View>

            <SectionHeading icon={{ ios: 'book.fill', android: 'auto_stories', web: 'auto_stories' }} title="Leitura" />
            <View style={styles.card}>
              {data.reading.totalCompleted === 0 ? (
                <EmptyChart message="Conclua uma leitura para acompanhar sua compreensão." />
              ) : (
                <>
                  <View style={styles.compactMetrics}>
                    <CompactMetric label="Concluídas" value={data.reading.totalCompleted} />
                    <CompactMetric label="Sucesso" value={data.reading.successCount} />
                    <CompactMetric label="Precisa praticar" value={data.reading.needsPracticeCount} />
                  </View>
                  <View style={styles.cardDivider} />
                  <ScoreProgressBar color="#35a7d7" label="Compreensão média" value={data.reading.averageComprehension} />
                  <DifficultyReading rows={data.reading.byDifficulty} />
                </>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

function FullError({ onBack, onRetry }: { onBack: () => void; onRetry: () => void }) {
  const styles = useThemedStyles(baseStyles);
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}><ScreenHeader onBack={onBack} title="Meu progresso" /></View>
      <View style={styles.fullError}>
      <Text style={styles.fullErrorTitle}>Não foi possível carregar seu progresso.</Text>
      <Text style={styles.fullErrorText}>Verifique sua conexão e tente novamente.</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}><Text style={styles.retryText}>Tentar novamente</Text></Pressable>
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

function InlineNotice({ message }: { message: string }) {
  const styles = useThemedStyles(baseStyles);
  return <View style={styles.notice}><SymbolView accessible={false} name={{ ios: 'exclamationmark.circle.fill', android: 'error', web: 'error' }} size={17} tintColor="#a26724" /><Text style={styles.noticeText}>{message}</Text></View>;
}

function SectionHeading({ icon, subtitle, title }: { icon: SymbolViewProps['name']; subtitle?: string; title: string }) {
  const styles = useThemedStyles(baseStyles);
  return (
    <View style={styles.sectionHeading}>
      <View style={styles.sectionIcon}><SymbolView accessible={false} name={icon} size={18} tintColor="#5b50f5" /></View>
      <View style={styles.sectionCopy}><Text style={styles.sectionTitle}>{title}</Text>{subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}</View>
    </View>
  );
}

function WeeklyGoalsCard({ goals, today }: { goals: WeeklyGoals; today: string }) {
  const styles = useThemedStyles(baseStyles);
  return (
    <View style={styles.card}>
      <View style={styles.weekRow}>
        {goals.days.map((day, index) => {
          const detail = `${day.vocabulary.completed ? 'vocabulário concluído' : 'vocabulário pendente'}, ${day.conversation.completed ? 'conversa concluída' : 'conversa pendente'}, ${day.reading.completed ? 'leitura concluída' : 'leitura pendente'}`;
          return (
            <View accessibilityLabel={`${WEEKDAY_LABELS[index]}: ${day.goalCompleted ? 'meta cumprida' : 'meta não cumprida'}. ${detail}`} key={day.date} style={styles.weekDay}>
              <Text style={[styles.weekDayLabel, day.date === today && styles.weekDayToday]}>{WEEKDAY_LABELS[index]}</Text>
              <View style={[styles.weekCircle, day.goalCompleted && styles.weekCircleComplete, day.date === today && styles.weekCircleToday]}>
                {day.goalCompleted ? <SymbolView accessible={false} name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={16} tintColor="#ffffff" /> : <View style={styles.weekEmptyDot} />}
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.weekSummary}><Text style={styles.weekSummaryValue}>{goals.completedDays}/{goals.totalDays} dias</Text><Text style={styles.weekSummaryText}>com a meta completa nesta semana</Text></View>
    </View>
  );
}

function PeriodPicker({ onChange, selected }: { onChange: (period: ProgressPeriod) => void; selected: ProgressPeriod }) {
  const styles = useThemedStyles(baseStyles);
  return (
    <View accessibilityLabel="Período do progresso" accessibilityRole="tablist" style={styles.periods}>
      {PROGRESS_PERIOD_OPTIONS.map((option) => {
        const active = option.value === selected;
        return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} key={option.value} onPress={() => onChange(option.value)} style={({ pressed }) => [styles.periodButton, active && styles.periodButtonActive, pressed && styles.pressed]}><Text numberOfLines={1} style={[styles.periodText, active && styles.periodTextActive]}>{option.label}</Text></Pressable>;
      })}
    </View>
  );
}

function MetricCard({ color, label, suffix = '', value }: { color: string; label: string; suffix?: string; value: number }) {
  const styles = useThemedStyles(baseStyles);
  return <View style={styles.metricCard}><View style={[styles.metricAccent, { backgroundColor: color }]} /><Text style={styles.metricValue}>{value}{suffix}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}

function CompactMetric({ label, percent = false, value }: { label: string; percent?: boolean; value: number | null }) {
  const styles = useThemedStyles(baseStyles);
  return <View style={styles.compactMetric}><Text style={styles.compactValue}>{value === null ? '—' : `${Math.round(value)}${percent ? '%' : ''}`}</Text><Text style={styles.compactLabel}>{label}</Text></View>;
}

function ScoreSummary({ label, value }: { label: string; value: number | null }) {
  const styles = useThemedStyles(baseStyles);
  return <View style={styles.scoreSummaryItem}><Text style={styles.scoreSummaryValue}>{formatProgressScore(value)}</Text><Text style={styles.scoreSummaryLabel}>{label}</Text></View>;
}

function DifficultyConversation({ rows }: { rows: ConversationDifficultyProgress[] }) {
  const styles = useThemedStyles(baseStyles);
  const available = rows.filter((row) => row.count > 0);
  if (available.length === 0) return null;
  return <View style={styles.difficultyBlock}><Text style={styles.cardSubtitle}>Por dificuldade</Text>{available.map((row) => <View key={row.difficulty} style={styles.difficultyRow}><Text style={styles.difficultyName}>{getProgressDifficultyLabel(row.difficulty)}</Text><Text style={styles.difficultyDetail}>{row.count} {row.count === 1 ? 'atividade' : 'atividades'}</Text><Text style={styles.difficultyScore}>{formatProgressScore(row.averageOverall)}</Text></View>)}</View>;
}

function DifficultyReading({ rows }: { rows: ReadingDifficultyProgress[] }) {
  const styles = useThemedStyles(baseStyles);
  const available = rows.filter((row) => row.count > 0);
  if (available.length === 0) return null;
  return <View style={styles.difficultyBlock}><Text style={styles.cardSubtitle}>Por dificuldade</Text>{available.map((row) => <View key={row.difficulty} style={styles.difficultyRow}><Text style={styles.difficultyName}>{getProgressDifficultyLabel(row.difficulty)}</Text><Text style={styles.difficultyDetail}>{row.count} {row.count === 1 ? 'atividade' : 'atividades'}</Text><Text style={styles.difficultyScore}>{formatProgressScore(row.averageComprehension)}</Text></View>)}</View>;
}

const baseStyles = StyleSheet.create({
  screen: { backgroundColor: '#f8f9ff', flex: 1 },
  header: { paddingHorizontal: 18 },
  content: { alignSelf: 'center', maxWidth: 430, paddingBottom: 34, paddingHorizontal: 20, width: '100%' },
  intro: { marginBottom: 8, marginTop: 5 },
  introTitle: { color: '#171528', fontSize: 25, fontWeight: '800', letterSpacing: -0.5 },
  introSubtitle: { color: '#747a8e', fontSize: 13, marginTop: 4 },
  loading: { alignItems: 'center', justifyContent: 'center', minHeight: 360 },
  loadingText: { color: '#686e82', fontSize: 12.5, marginTop: 12 },
  fullError: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e8eaf2', borderRadius: 18, borderWidth: 1, marginTop: 22, padding: 22 },
  fullErrorTitle: { color: '#322d48', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  fullErrorText: { color: '#767b8e', fontSize: 12, marginTop: 6, textAlign: 'center' },
  retryButton: { backgroundColor: '#5b50f5', borderRadius: 10, marginTop: 14, minHeight: 40, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  notice: { alignItems: 'center', backgroundColor: '#fff5df', borderRadius: 12, flexDirection: 'row', gap: 8, marginTop: 10, padding: 11 },
  noticeText: { color: '#75511f', flex: 1, fontSize: 11.5, lineHeight: 16 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', marginBottom: 9, marginTop: 20 },
  sectionIcon: { alignItems: 'center', backgroundColor: '#efedff', borderRadius: 10, height: 32, justifyContent: 'center', marginRight: 9, width: 32 },
  sectionCopy: { flex: 1 },
  sectionTitle: { color: '#171528', fontSize: 16, fontWeight: '800' },
  sectionSubtitle: { color: '#777d90', fontSize: 10.5, marginTop: 2 },
  card: { backgroundColor: '#ffffff', borderColor: '#e7e9f2', borderRadius: 16, borderWidth: 1, padding: 13 },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: { alignItems: 'center', flex: 1, minWidth: 0 },
  weekDayLabel: { color: '#777d90', fontSize: 10, fontWeight: '700', marginBottom: 7 },
  weekDayToday: { color: '#5549df' },
  weekCircle: { alignItems: 'center', backgroundColor: '#f0f2f8', borderColor: '#dfe2ec', borderRadius: 16, borderWidth: 1, height: 30, justifyContent: 'center', width: 30 },
  weekCircleComplete: { backgroundColor: '#2da66f', borderColor: '#2da66f' },
  weekCircleToday: { borderColor: '#6b5cff', borderWidth: 2 },
  weekEmptyDot: { borderColor: '#9ca2b3', borderRadius: 6, borderWidth: 1.5, height: 10, width: 10 },
  weekSummary: { alignItems: 'baseline', borderTopColor: '#eceef5', borderTopWidth: 1, flexDirection: 'row', gap: 6, marginTop: 13, paddingTop: 11 },
  weekSummaryValue: { color: '#2f295f', fontSize: 14, fontWeight: '800' },
  weekSummaryText: { color: '#73798c', flex: 1, fontSize: 10.5 },
  periods: { backgroundColor: '#eceef8', borderRadius: 11, flexDirection: 'row', gap: 4, marginBottom: 10, padding: 4 },
  periodButton: { alignItems: 'center', borderRadius: 8, flex: 1, justifyContent: 'center', minHeight: 34, minWidth: 0, paddingHorizontal: 4 },
  periodButtonActive: { backgroundColor: '#ffffff' },
  periodText: { color: '#747a8e', fontSize: 10.5, fontWeight: '700' },
  periodTextActive: { color: '#5147df' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  metricCard: { backgroundColor: '#ffffff', borderColor: '#e7e9f2', borderRadius: 14, borderWidth: 1, flexBasis: '47%', flexGrow: 1, minHeight: 82, overflow: 'hidden', padding: 12 },
  metricAccent: { borderRadius: 3, height: 4, marginBottom: 8, width: 26 },
  metricValue: { color: '#171528', fontSize: 21, fontWeight: '800' },
  metricLabel: { color: '#747a8e', fontSize: 10.5, marginTop: 3 },
  scoreSummary: { alignItems: 'stretch', flexDirection: 'row' },
  scoreSummaryItem: { alignItems: 'center', flex: 1, minWidth: 0, paddingVertical: 2 },
  scoreSummaryValue: { color: '#2f295f', fontSize: 19, fontWeight: '800' },
  scoreSummaryLabel: { color: '#73798c', fontSize: 10.5, marginTop: 3 },
  verticalDivider: { backgroundColor: '#e8eaf2', width: 1 },
  cardDivider: { backgroundColor: '#e9ebf3', height: 1, marginVertical: 12 },
  compactMetrics: { flexDirection: 'row', gap: 7 },
  compactMetric: { alignItems: 'center', backgroundColor: '#f7f8fd', borderRadius: 11, flex: 1, minWidth: 0, paddingHorizontal: 4, paddingVertical: 9 },
  compactValue: { color: '#27233f', fontSize: 15, fontWeight: '800' },
  compactLabel: { color: '#777d90', fontSize: 9.5, marginTop: 3, textAlign: 'center' },
  periodDetail: { color: '#70768a', fontSize: 10.5, lineHeight: 15, marginTop: 12 },
  cardSubtitle: { color: '#3c4052', fontSize: 11.5, fontWeight: '800', marginBottom: 9 },
  scoreBars: { gap: 10 },
  difficultyBlock: { borderTopColor: '#e9ebf3', borderTopWidth: 1, marginTop: 13, paddingTop: 12 },
  difficultyRow: { alignItems: 'center', flexDirection: 'row', minHeight: 29 },
  difficultyName: { color: '#3f4355', flex: 1, fontSize: 11, fontWeight: '700' },
  difficultyDetail: { color: '#7a8093', fontSize: 9.5, marginHorizontal: 6 },
  difficultyScore: { color: '#5147df', fontSize: 10.5, fontWeight: '800', minWidth: 50, textAlign: 'right' },
  pressed: { opacity: 0.72 },
});

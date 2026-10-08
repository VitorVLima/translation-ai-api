import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useCallback, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PageLoading } from '../../../components/PageLoading';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { useDeterministicBack } from '../../../hooks/use-deterministic-back';
import { getBackDestination } from '../../../navigation/back-destinations';
import { ReadingActivityCard } from '../components/ReadingActivityCard';
import { ReadingIntroHero } from '../components/ReadingIntroHero';
import { filterReadingActivities } from '../reading.presentation';
import { deleteReadingActivity, getReadingActivities } from '../reading.service';
import type { ReadingActivitySummary } from '../reading.types';

export function ReadingScreen() {
  const styles = useThemedStyles(baseStyles);
  const [activities, setActivities] = useState<ReadingActivitySummary[]>([]);
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [deletingActivityId, setDeletingActivityId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const mounted = useRef(true);
  const loaded = useRef(false);
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const goToPractice = useCallback(() => router.replace(getBackDestination('reading')), []);
  useDeterministicBack(goToPractice);

  const load = useCallback(async (background = false) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    const currentRequestId = ++requestId.current;
    controllerRef.current = controller;
    if (!background && !loaded.current) setStatus('loading');
    if (background) {
      setRefreshing(true);
      setRefreshError(false);
    }
    try {
      const result = await getReadingActivities(controller.signal);
      if (!mounted.current || currentRequestId !== requestId.current) return;
      setActivities(result);
      setStatus('success');
      loaded.current = true;
    } catch {
      if (!mounted.current || currentRequestId !== requestId.current) return;
      if (background) setRefreshError(true);
      else setStatus('error');
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      if (mounted.current && currentRequestId === requestId.current && background) setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    mounted.current = true;
    void load(loaded.current);
    return () => {
      mounted.current = false;
      requestId.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [load]));

  const active = useMemo(() => activities.find((activity) => activity.status === 'IN_PROGRESS') ?? null, [activities]);
  const visibleActivities = useMemo(() => filterReadingActivities(activities, searchQuery), [activities, searchQuery]);
  const visibleActive = visibleActivities.find((activity) => activity.status === 'IN_PROGRESS') ?? null;
  const completed = visibleActivities.filter((activity) => activity.status !== 'IN_PROGRESS');
  const refresh = useCallback(() => { void load(true); }, [load]);

  const deleteActiveReading = useCallback(async (activityId: string) => {
    if (deletingActivityId) return;
    setDeletingActivityId(activityId);
    setDeleteError(false);
    try {
      await deleteReadingActivity(activityId);
      if (!mounted.current) return;
      setActivities((current) => current.filter((activity) => activity.activityId !== activityId));
    } catch {
      if (mounted.current) setDeleteError(true);
    } finally {
      if (mounted.current) setDeletingActivityId(null);
    }
  }, [deletingActivityId]);

  const confirmDelete = useCallback((activityId: string) => {
    if (deletingActivityId) return;
    Alert.alert('Excluir leitura?', 'A leitura em andamento e seu progresso serão descartados.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => void deleteActiveReading(activityId) },
    ]);
  }, [deleteActiveReading, deletingActivityId]);

  if (status === 'loading') return <PageLoading label="Carregando suas leituras..." onBack={goToPractice} title="Leitura" />;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}><ScreenHeader onBack={goToPractice} title="Leitura" /></View>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl colors={['#5b50f5']} onRefresh={() => void refresh()} refreshing={refreshing} tintColor="#5b50f5" />} showsVerticalScrollIndicator={false}>
        <ReadingIntroHero />
        <View style={styles.searchField}>
          <SymbolView accessible={false} name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} size={19} tintColor="#68728e" />
          <TextInput
            accessibilityLabel="Buscar leituras"
            onChangeText={setSearchQuery}
            placeholder="Buscar leituras..."
            placeholderTextColor="#737d99"
            returnKeyType="search"
            style={styles.searchInput}
            value={searchQuery}
          />
        </View>
        {refreshError ? <View style={styles.refreshError}><Text style={styles.errorText}>Não foi possível atualizar suas leituras.</Text><Pressable accessibilityRole="button" onPress={refresh}><Text style={styles.retryText}>Tentar novamente</Text></Pressable></View> : null}
        <Pressable
          accessibilityLabel="Gerar nova leitura"
          accessibilityHint={active ? 'Conclua ou exclua a leitura em andamento para gerar outra.' : undefined}
          accessibilityRole="button"
          accessibilityState={{ disabled: status === 'success' && active !== null }}
          disabled={status === 'success' && active !== null}
          onPress={() => router.push('/practice/reading/new')}
          style={({ pressed }) => [styles.newButton, status === 'success' && active && styles.newButtonDisabled, pressed && styles.pressed]}
        >
          <View style={styles.newButtonLabel}>
            <SymbolView accessible={false} name={{ ios: 'plus', android: 'add', web: 'add' }} size={20} tintColor="#ffffff" />
            <Text style={styles.newButtonText}>Nova leitura</Text>
          </View>
          <SymbolView accessible={false} name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} size={20} tintColor="#ffffff" />
        </Pressable>
        {status === 'success' && active ? <Text style={styles.activeHint}>Conclua ou exclua a leitura em andamento para gerar outra.</Text> : null}
        {status === 'error' ? <View style={styles.errorBox}><Text style={styles.errorText}>Não foi possível carregar suas leituras.</Text><Pressable accessibilityRole="button" onPress={() => void load()}><Text style={styles.retryText}>Tentar novamente</Text></Pressable></View> : null}
        {status === 'success' ? <View style={styles.section}>
          <Text style={styles.sectionTitle}>Histórico</Text>
          {visibleActive ? <View style={styles.cardSpacing}><ReadingActivityCard activity={visibleActive} deleting={deletingActivityId === visibleActive.activityId} onDelete={() => confirmDelete(visibleActive.activityId)} onPress={() => router.push(`/practice/reading/${visibleActive.activityId}`)} prominent /></View> : null}
          {completed.map((activity) => <View key={activity.activityId} style={styles.cardSpacing}><ReadingActivityCard activity={activity} onPress={() => router.push(`/practice/reading/${activity.activityId}`)} /></View>)}
          {deleteError && active ? <View style={styles.deleteError}><Text style={styles.errorText}>Não foi possível excluir a leitura.</Text><Pressable accessibilityRole="button" disabled={Boolean(deletingActivityId)} onPress={() => confirmDelete(active.activityId)}><Text style={styles.retryText}>Tentar novamente</Text></Pressable></View> : null}
          {visibleActivities.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>{searchQuery.trim() ? 'Nenhuma leitura encontrada' : 'Comece sua primeira leitura'}</Text><Text style={styles.emptyText}>{searchQuery.trim() ? 'Tente buscar por outro título ou tema.' : 'Escolha um nível e um tema para praticar compreensão em inglês.'}</Text></View> : null}
        </View> : null}
      </ScrollView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const baseStyles = StyleSheet.create({
  screen: { backgroundColor: '#f8f9ff', flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 7 },
  content: { paddingBottom: 24, paddingHorizontal: 20 },
  searchField: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e3e6ef', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 10, marginTop: 8, minHeight: 47, paddingHorizontal: 13 },
  searchInput: { color: '#242136', flex: 1, fontSize: 13, paddingVertical: 8 },
  newButton: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 13, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, marginTop: 8, minHeight: 48, paddingHorizontal: 15 },
  newButtonDisabled: { opacity: 0.55 },
  newButtonLabel: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  newButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  activeHint: { color: '#68728c', fontSize: 11, marginBottom: 10, marginTop: -8 },
  section: { marginBottom: 17 },
  sectionTitle: { color: '#25213d', fontSize: 15, fontWeight: '800', marginBottom: 8 },
  cardSpacing: { marginBottom: 8 },
  state: { alignItems: 'center', paddingVertical: 28 },
  stateText: { color: '#68728c', fontSize: 13, marginTop: 10 },
  errorBox: { alignItems: 'center', paddingVertical: 24 },
  errorText: { color: '#8f4956', fontSize: 14, textAlign: 'center' },
  deleteError: { alignItems: 'center', marginTop: 8 },
  refreshError: { alignItems: 'center', backgroundColor: '#fff4ee', borderColor: '#ffdccc', borderRadius: 11, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 12, paddingVertical: 10 },
  retryText: { color: '#5147df', fontSize: 14, fontWeight: '700', marginTop: 11 },
  empty: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e7e9f2', borderRadius: 16, borderWidth: 1, marginTop: 2, padding: 20 },
  emptyTitle: { color: '#25213d', fontSize: 15, fontWeight: '800' },
  emptyText: { color: '#68728c', fontSize: 13, lineHeight: 18, marginTop: 6, textAlign: 'center' },
  pressed: { opacity: 0.78 },
});

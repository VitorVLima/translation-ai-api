import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
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
import { ConversationIntroHero } from '../components/ConversationIntroHero';
import { ConversationListItem } from '../components/ConversationListItem';
import {
  filterConversationListItems,
  getConversationListItemPresentation,
  groupConversations,
  type ConversationFilter,
} from '../conversations.presentation';
import { deleteConversation, getConversations } from '../conversations.service';
import type { ConversationSummary } from '../conversations.types';

type ScreenStatus = 'loading' | 'success' | 'error';

export function ConversationsScreen() {
  const styles = useThemedStyles(baseStyles);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [filter, setFilter] = useState<ConversationFilter>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState<ScreenStatus>('loading');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null);
  const requestId = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);
  const goHome = useCallback(() => router.replace(getBackDestination('conversations')), []);

  useDeterministicBack(goHome);

  const loadConversations = useCallback(async (mode: 'focus' | 'initial' | 'refresh' = 'initial') => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    const currentRequestId = ++requestId.current;
    const background = mode === 'refresh' || (mode === 'focus' && statusRef.current === 'success');
    controllerRef.current = controller;
    if (background) {
      setIsRefreshing(true);
    } else {
      setStatus('loading');
    }
    setRefreshFailed(false);

    try {
      const result = await getConversations(controller.signal);
      if (currentRequestId !== requestId.current) return;
      setConversations(result);
      setStatus('success');
    } catch {
      if (currentRequestId !== requestId.current) return;
      if (background) {
        setRefreshFailed(true);
      } else {
        setStatus('error');
      }
    } finally {
      if (currentRequestId === requestId.current && background) {
        setIsRefreshing(false);
      }
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadConversations('focus');
    return () => {
      requestId.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [loadConversations]));

  const groups = useMemo(() => groupConversations(conversations), [conversations]);
  const visibleConversations = filter === 'active' ? groups.active : groups.completed;
  const listItems = useMemo(() => filterConversationListItems(
    visibleConversations.map((conversation) => getConversationListItemPresentation(conversation, API_URL)),
    searchQuery,
  ), [visibleConversations, searchQuery]);
  const hasHistory = conversations.length > 0;

  const openCreateConversation = () => router.push('/conversations/new');
  const openConversation = (conversationId: string) => {
    router.push({ pathname: '/conversations/[id]', params: { id: conversationId } });
  };

  const requestDelete = useCallback((conversation: Pick<ConversationSummary, 'id' | 'title'>) => {
    if (deletingConversationId) return;
    Alert.alert(
      'Excluir conversa?',
      'A conversa e todo o seu histórico serão excluídos permanentemente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () => {
            if (deletingConversationId) return;
            setDeletingConversationId(conversation.id);
            setDeleteError(false);
            void deleteConversation(conversation.id)
              .then(() => setConversations((current) => current.filter(({ id }) => id !== conversation.id)))
              .catch(() => setDeleteError(true))
              .finally(() => setDeletingConversationId(null));
          },
        },
      ],
    );
  }, [deletingConversationId]);

  const header = (
    <View style={styles.header}>
      <ScreenHeader onBack={goHome} title="Conversas" />
      <ConversationIntroHero />
      <View style={styles.searchField}>
        <SymbolView
          accessible={false}
          name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
          size={19}
          tintColor="#68728e"
        />
        <TextInput
          accessibilityLabel="Buscar conversas ou personagens"
          onChangeText={setSearchQuery}
          placeholder="Buscar conversas ou personagens..."
          placeholderTextColor="#737d99"
          returnKeyType="search"
          style={styles.searchInput}
          value={searchQuery}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Criar nova conversa"
        onPress={openCreateConversation}
        style={({ pressed }) => [styles.newButton, pressed && styles.buttonPressed]}
      >
        <View style={styles.newButtonLabel}>
          <SymbolView
            accessible={false}
            name={{ ios: 'plus', android: 'add', web: 'add' }}
            size={20}
            tintColor="#ffffff"
          />
          <Text style={styles.newButtonText}>Nova conversa</Text>
        </View>
        <SymbolView
          accessible={false}
          name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }}
          size={20}
          tintColor="#ffffff"
        />
      </Pressable>
    </View>
  );

  if (status === 'loading') return <PageLoading label="Carregando suas conversas..." onBack={goHome} title="Conversas" />;

  if (status === 'error') {
    return (
      <View style={styles.screen}>
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
          <View style={styles.content}>{header}</View>
          <View accessibilityLiveRegion="polite" style={styles.centerState}>
            <View style={styles.stateIcon}>
              <SymbolView
                accessible={false}
                name={{ ios: 'exclamationmark.bubble.fill', android: 'error', web: 'error' }}
                size={29}
                tintColor="#5b50f5"
              />
            </View>
            <Text style={styles.stateTitle}>Não foi possível carregar suas conversas.</Text>
            <Text style={styles.stateDescription}>Verifique sua conexão e tente novamente.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadConversations()}
              style={({ pressed }) => [styles.retryButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.retryButtonText}>Tentar novamente</Text>
            </Pressable>
          </View>
        </SafeAreaView>
        <StatusBar style="auto" />
      </View>
    );
  }

  const filterControl = hasHistory ? (
    <View accessibilityRole="tablist" style={styles.filters}>
      {([
        { key: 'active' as const, label: 'Em andamento', count: groups.active.length },
        { key: 'completed' as const, label: 'Concluídas', count: groups.completed.length },
      ]).map((option) => {
        const selected = filter === option.key;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.key}
            onPress={() => setFilter(option.key)}
            style={({ pressed }) => [
              styles.filterButton,
              selected && styles.filterButtonSelected,
              pressed && styles.filterButtonPressed,
            ]}
          >
            <Text style={[styles.filterText, selected && styles.filterTextSelected]}>
              {option.label} ({option.count})
            </Text>
          </Pressable>
        );
      })}
    </View>
  ) : null;

  return (
    <View style={styles.screen}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <FlatList
          contentContainerStyle={styles.listContent}
          data={listItems}
          ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={(
            <View style={styles.emptyCard}>
              <View style={styles.stateIcon}>
                <SymbolView
                  accessible={false}
                  name={{
                    ios: filter === 'active' ? 'bubble.left.and.bubble.right.fill' : 'checkmark.circle.fill',
                    android: filter === 'active' ? 'forum' : 'check_circle',
                    web: filter === 'active' ? 'forum' : 'check_circle',
                  }}
                  size={31}
                  tintColor="#5b50f5"
                />
              </View>
              <Text style={styles.stateTitle}>
                {searchQuery.trim()
                  ? 'Nenhuma conversa encontrada'
                  : !hasHistory
                  ? 'Comece sua primeira conversa'
                  : filter === 'active'
                    ? 'Nenhuma conversa em andamento'
                    : 'Nenhuma conversa concluída'}
              </Text>
              <Text style={styles.stateDescription}>
                {searchQuery.trim()
                  ? 'Tente outro termo ou limpe a busca.'
                  : !hasHistory
                  ? 'Pratique situações reais em inglês com a IA.'
                  : filter === 'active'
                    ? 'Inicie uma nova conversa para continuar praticando.'
                    : 'As conversas finalizadas aparecerão aqui.'}
              </Text>
              {filter === 'active' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={searchQuery.trim() ? () => setSearchQuery('') : openCreateConversation}
                  style={({ pressed }) => [styles.emptyButton, pressed && styles.buttonPressed]}
                >
                  <Text style={styles.emptyButtonText}>
                    {searchQuery.trim() ? 'Limpar busca' : hasHistory ? 'Nova conversa' : 'Criar conversa'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
          ListHeaderComponent={(
            <>
              {header}
              {refreshFailed ? (
                <View accessibilityLiveRegion="polite" style={styles.refreshError}>
                  <Text style={styles.refreshErrorText}>Não foi possível atualizar as conversas.</Text>
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => void loadConversations('refresh')}
                  >
                    <Text style={styles.refreshRetryText}>Tentar novamente</Text>
                  </Pressable>
                </View>
              ) : null}
              {deleteError ? (
                <View accessibilityLiveRegion="polite" style={styles.deleteError}>
                  <Text style={styles.refreshErrorText}>Não foi possível excluir a conversa. Tente novamente.</Text>
                  <Pressable accessibilityRole="button" onPress={() => setDeleteError(false)}>
                    <Text style={styles.refreshRetryText}>Fechar</Text>
                  </Pressable>
                </View>
              ) : null}
              {filterControl}
            </>
          )}
          refreshControl={(
            <RefreshControl
              colors={['#5b50f5']}
              onRefresh={() => void loadConversations('refresh')}
              refreshing={isRefreshing}
              tintColor="#5b50f5"
            />
          )}
          renderItem={({ item }) => (
            <ConversationListItem
              conversation={item}
              onContinue={() => openConversation(item.id)}
              onDelete={() => requestDelete(item)}
              deleteDisabled={deletingConversationId !== null}
            />
          )}
          showsVerticalScrollIndicator={false}
          style={styles.list}
        />
      </SafeAreaView>
      <StatusBar style="auto" />
    </View>
  );
}

const baseStyles = StyleSheet.create({
  screen: { backgroundColor: '#f6f7fc', flex: 1 },
  safeArea: { flex: 1 },
  list: { flex: 1 },
  listContent: {
    alignSelf: 'center',
    flexGrow: 1,
    maxWidth: 478,
    paddingBottom: 28,
    paddingHorizontal: 16,
    width: '100%',
  },
  content: { alignSelf: 'center', maxWidth: 478, paddingHorizontal: 16, width: '100%' },
  header: { paddingBottom: 10, paddingTop: 2 },
  searchField: {
    alignItems: 'center',
    backgroundColor: '#edf0f9',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    minHeight: 48,
    paddingHorizontal: 13,
  },
  searchInput: { color: '#20233d', flex: 1, fontSize: 13, minHeight: 46, paddingVertical: 0 },
  newButton: {
    alignItems: 'center',
    backgroundColor: '#5147f5',
    borderRadius: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    minHeight: 50,
    paddingHorizontal: 16,
    width: '100%',
  },
  newButtonLabel: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  newButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  buttonPressed: { opacity: 0.78 },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 80,
    paddingHorizontal: 32,
  },
  stateIcon: {
    alignItems: 'center',
    backgroundColor: '#ebe8ff',
    borderRadius: 27,
    height: 54,
    justifyContent: 'center',
    width: 54,
  },
  stateTitle: {
    color: '#171528',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 23,
    marginTop: 14,
    textAlign: 'center',
  },
  stateDescription: {
    color: '#74798d',
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 6,
    maxWidth: 280,
    textAlign: 'center',
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: '#5b50f5',
    borderRadius: 11,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 44,
    paddingHorizontal: 18,
  },
  retryButtonText: { color: '#ffffff', fontSize: 12.5, fontWeight: '700' },
  filters: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 9,
  },
  filterButton: {
    alignItems: 'center',
    backgroundColor: '#eceef7',
    borderRadius: 22,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 9,
  },
  filterButtonSelected: {
    backgroundColor: '#315bf3',
  },
  filterButtonPressed: { opacity: 0.72 },
  filterText: { color: '#727b95', fontSize: 11, fontWeight: '600' },
  filterTextSelected: { color: '#ffffff', fontWeight: '700' },
  itemSeparator: { height: 8 },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#e5e7f0',
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 230,
    padding: 24,
  },
  emptyButton: {
    alignItems: 'center',
    backgroundColor: '#5b50f5',
    borderRadius: 11,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 44,
    paddingHorizontal: 18,
  },
  emptyButtonText: { color: '#ffffff', fontSize: 12.5, fontWeight: '700' },
  refreshError: {
    alignItems: 'center',
    backgroundColor: '#fff4ee',
    borderColor: '#ffdccc',
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  deleteError: {
    alignItems: 'center',
    backgroundColor: '#fff1f1',
    borderColor: '#f0cdcf',
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  refreshErrorText: { color: '#7b4a36', flex: 1, fontSize: 11 },
  refreshRetryText: { color: '#a34d2b', fontSize: 11, fontWeight: '700', marginLeft: 8 },
});

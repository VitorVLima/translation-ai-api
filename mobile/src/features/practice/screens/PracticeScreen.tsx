import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useCallback, useState } from 'react';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { useDeterministicBack } from '../../../hooks/use-deterministic-back';
import { getBackDestination } from '../../../navigation/back-destinations';

type PracticeCard = {
  description: string;
  destination: '/practice/vocabulary' | '/practice/reading' | '/practice/translator' | '/practice/correction';
  icon: SymbolViewProps['name'];
  iconBackgroundColor: string;
  title: string;
};

const PRACTICE_CARDS: PracticeCard[] = [
  {
    description: 'Aprenda e revise novas palavras.',
    destination: '/practice/vocabulary',
    icon: { ios: 'book.fill', android: 'menu_book', web: 'menu_book' },
    iconBackgroundColor: '#4c9df8',
    title: 'Vocabulário',
  },
  {
    description: 'Leia textos e desenvolva sua compreensão.',
    destination: '/practice/reading',
    icon: { ios: 'book.closed.fill', android: 'menu_book', web: 'menu_book' },
    iconBackgroundColor: '#ffa143',
    title: 'Leitura',
  },
  {
    description: 'Traduza palavras e frases entre português e inglês.',
    destination: '/practice/translator',
    icon: { ios: 'character.book.closed.fill', android: 'translate', web: 'translate' },
    iconBackgroundColor: '#9856e9',
    title: 'Tradutor',
  },
  {
    description: 'Corrija seus textos em inglês.',
    destination: '/practice/correction',
    icon: { ios: 'doc.text.fill', android: 'description', web: 'description' },
    iconBackgroundColor: '#4fc99d',
    title: 'Correção',
  },
];

export function PracticeScreen() {
  const styles = useThemedStyles(baseStyles);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const goHome = () => router.replace(getBackDestination('practice'));
  const refresh = useCallback(() => {
    setIsRefreshing(true);
    requestAnimationFrame(() => setIsRefreshing(false));
  }, []);

  useDeterministicBack(goHome);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        <ScreenHeader onBack={goHome} title="Praticar" />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={(
          <RefreshControl
            colors={['#5b50f5']}
            onRefresh={refresh}
            refreshing={isRefreshing}
            tintColor="#5b50f5"
          />
        )}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Escolha um modo para praticar{ '\n' }e evoluir seu inglês.
        </Text>
        <View style={styles.cards}>
          {PRACTICE_CARDS.map((card) => (
            <Pressable
              accessibilityHint={`Abre a prática de ${card.title.toLocaleLowerCase('pt-BR')}`}
              accessibilityLabel={`${card.title}. ${card.description}`}
              accessibilityRole="button"
              key={card.title}
              onPress={() => router.push(card.destination)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={[styles.iconBox, { backgroundColor: card.iconBackgroundColor }]}>
                <SymbolView accessible={false} name={card.icon} size={36} tintColor="#ffffff" />
              </View>
              <View style={styles.cardText}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <Text style={styles.cardDescription}>{card.description}</Text>
              </View>
              <SymbolView
                accessible={false}
                name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                size={24}
                tintColor="#6f7892"
              />
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const baseStyles = StyleSheet.create({
  screen: {
    backgroundColor: '#f8f9ff',
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 7,
  },
  content: {
    paddingBottom: 20,
    paddingHorizontal: 18,
  },
  intro: {
    color: '#71809e',
    fontSize: 19,
    fontWeight: '400',
    lineHeight: 27,
    marginBottom: 18,
    marginTop: 5,
    textAlign: 'center',
  },
  cards: {
    gap: 8,
  },
  card: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 23,
    elevation: 2,
    flexDirection: 'row',
    minHeight: 106,
    padding: 11,
    shadowColor: '#98a2b8',
    shadowOffset: { height: 5, width: 0 },
    shadowOpacity: 0.09,
    shadowRadius: 14,
  },
  cardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  iconBox: {
    alignItems: 'center',
    borderRadius: 21,
    height: 78,
    justifyContent: 'center',
    width: 78,
  },
  cardText: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  cardTitle: {
    color: '#111b3d',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 22,
  },
  cardDescription: {
    color: '#71809e',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
});

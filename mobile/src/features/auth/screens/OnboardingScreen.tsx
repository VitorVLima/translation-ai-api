import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SymbolView } from 'expo-symbols';
import {
  BackHandler, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View,
  useWindowDimensions, type ImageSourcePropType, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { setOnboardingHidden } from '../onboarding-preference.storage';
import { ArtworkSoftener } from '../../../components/ArtworkSoftener';
import { useTheme } from '../../../theme/ThemeProvider';

type Page = {
  key: string;
  title: string;
  description: string;
  image: ImageSourcePropType;
};

const PAGES: Page[] = [
  {
    key: 'welcome',
    title: 'Aprenda inglês\nde forma completa',
    description: 'Pratique conversação, vocabulário, pronúncia e leitura em um só lugar.',
    image: require('../../../../assets/onboarding-1.png'),
  },
  {
    key: 'conversation',
    title: 'Converse e pratique',
    description: 'Pratique inglês em diferentes situações usando texto e voz.\nReceba feedback da nossa IA e evolua com conversas reais.',
    image: require('../../../../assets/onboarding-2.png'),
  },
  {
    key: 'vocabulary',
    title: 'Expanda seu vocabulário',
    description: 'Aprenda novas palavras, ouça exemplos e pratique frases usando sua voz.',
    image: require('../../../../assets/onboarding-3.png'),
  },
  {
    key: 'reading',
    title: 'Pratique todos os dias',
    description: 'Leia textos, responda perguntas e acompanhe sua evolução no inglês.\nPequenos passos, grandes resultados.',
    image: require('../../../../assets/onboarding-4.png'),
  },
];

export function OnboardingScreen() {
  const styles = useThemedStyles(baseStyles);
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const pageWidth = windowWidth - insets.left - insets.right;
  const listRef = useRef<FlatList<Page>>(null);
  const finishingRef = useRef(false);
  const mountedRef = useRef(true);
  const [pageIndex, setPageIndex] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [storageError, setStorageError] = useState('');

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  async function finishOnboarding() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setIsFinishing(true);
    setStorageError('');
    if (dontShowAgain) {
      try {
        await setOnboardingHidden(true);
      } catch {
        if (mountedRef.current) {
          setStorageError('Não foi possível salvar sua preferência. Tente novamente ou desmarque a opção.');
          setIsFinishing(false);
          finishingRef.current = false;
        }
        return;
      }
    }
    if (mountedRef.current) router.replace('/login');
  }

  const goToPage = useCallback((nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= PAGES.length) return;
    setPageIndex(nextIndex);
    listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
  }, []);

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (finishingRef.current) return true;
      if (pageIndex === 0) return false;
      goToPage(pageIndex - 1);
      return true;
    });
    return () => subscription.remove();
  }, [goToPage, pageIndex]);

  const renderPage = useCallback(({ item }: { item: Page }) => (
    <ScrollView contentContainerStyle={[styles.page, { width: pageWidth }]} showsVerticalScrollIndicator={false}>
      <View style={styles.illustrationArea}>
        <Image accessible={false} resizeMode="contain" source={item.image} style={styles.illustrationImage} />
        <ArtworkSoftener />
      </View>
      <View style={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>{item.title}</Text>
        <Text style={styles.description}>{item.description}</Text>
      </View>
    </ScrollView>
  ), [pageWidth, styles]);

  function handlePageSettled(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setPageIndex(Math.max(0, Math.min(nextIndex, PAGES.length - 1)));
  }

  const isLastPage = pageIndex === PAGES.length - 1;

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}>
        {pageIndex > 0 ? (
          <Pressable accessibilityLabel="Voltar à página anterior" accessibilityRole="button" disabled={isFinishing} onPress={() => goToPage(pageIndex - 1)} style={styles.headerButton}>
            <SymbolView accessible={false} name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} size={24} tintColor={colors.text} />
          </Pressable>
        ) : <View style={styles.headerSpacer} />}
        {!isLastPage ? (
          <Pressable accessibilityLabel="Pular" accessibilityRole="button" accessibilityState={{ busy: isFinishing, disabled: isFinishing }} disabled={isFinishing} onPress={() => void finishOnboarding()} style={styles.headerButton}>
            <Text style={styles.skipText}>Pular</Text>
          </Pressable>
        ) : <View style={styles.headerSpacer} />}
      </View>
      <FlatList
        ref={listRef}
        data={PAGES}
        renderItem={renderPage}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handlePageSettled}
        getItemLayout={(_, index) => ({ length: pageWidth, offset: pageWidth * index, index })}
        initialNumToRender={1}
        style={styles.list}
      />
      <View style={styles.footer}>
        <View accessible accessibilityLabel={`Página ${pageIndex + 1} de ${PAGES.length}`} accessibilityRole="text" style={styles.dots}>
          {PAGES.map((page, index) => (
            <View key={page.key} style={[styles.dot, index === pageIndex && styles.activeDot]} />
          ))}
        </View>
        <View style={styles.actions}>
          {pageIndex > 0 ? (
            <Pressable accessibilityLabel="Página anterior" accessibilityRole="button" disabled={isFinishing} onPress={() => goToPage(pageIndex - 1)} style={styles.previousButton}>
              <Text accessibilityElementsHidden style={styles.previousArrow}>←</Text>
              <Text style={styles.previousText}>Anterior</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isLastPage ? 'Começar' : 'Próxima página'}
            accessibilityState={{ busy: isFinishing, disabled: isFinishing }}
            disabled={isFinishing}
            onPress={() => isLastPage ? void finishOnboarding() : goToPage(pageIndex + 1)}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.primaryText}>{isLastPage ? 'Começar' : 'Próximo'}</Text>
            <Text accessibilityElementsHidden style={styles.arrow}>→</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityLabel="Não mostrar novamente"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: dontShowAgain, disabled: isFinishing }}
          disabled={isFinishing}
          onPress={() => { setDontShowAgain((current) => !current); setStorageError(''); }}
          style={styles.preferenceButton}
        >
          <View style={[styles.checkbox, dontShowAgain && styles.checkboxChecked]}>
            {dontShowAgain ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
          <Text style={styles.preferenceText}>Não mostrar novamente</Text>
        </Pressable>
        {storageError ? <Text accessibilityLiveRegion="polite" style={styles.storageError}>{storageError}</Text> : null}
      </View>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const baseStyles = StyleSheet.create({
  screen: { backgroundColor: '#fff', flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 20 },
  headerButton: { alignItems: 'center', justifyContent: 'center', minHeight: 48, minWidth: 48 },
  headerSpacer: { width: 48 },
  list: { flex: 1 },
  page: { alignItems: 'center', flexGrow: 1, paddingBottom: 20, paddingHorizontal: 20, paddingTop: 4 },
  illustrationArea: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e5e7f0', borderRadius: 24, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 130, overflow: 'hidden', width: '100%' },
  illustrationImage: { height: '100%', maxWidth: 420, width: '100%' },
  copy: { alignItems: 'center', marginTop: 12, maxWidth: 360 },
  title: { color: '#17143b', fontSize: 27, fontWeight: '800', lineHeight: 34, textAlign: 'center' },
  description: { color: '#62688c', fontSize: 16, lineHeight: 24, marginTop: 12, textAlign: 'center' },
  footer: { paddingBottom: 8, paddingHorizontal: 24 },
  dots: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 24 },
  dot: { backgroundColor: '#d9dbea', borderRadius: 6, height: 10, width: 10 },
  activeDot: { backgroundColor: '#5b50f5' },
  preferenceButton: { alignItems: 'center', alignSelf: 'center', flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 48, marginTop: 10, paddingHorizontal: 12 },
  checkbox: { alignItems: 'center', borderColor: '#8c92a7', borderRadius: 5, borderWidth: 1.5, height: 21, justifyContent: 'center', width: 21 },
  checkboxChecked: { backgroundColor: '#5b50f5', borderColor: '#5b50f5' },
  checkmark: { color: '#fff', fontSize: 15, fontWeight: '700', lineHeight: 19 },
  preferenceText: { color: '#4e5871', fontSize: 14 },
  actions: { alignItems: 'center', flexDirection: 'row', gap: 12, marginTop: 22 },
  previousButton: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#d9dbea', borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: 'row', justifyContent: 'center', minHeight: 54, paddingHorizontal: 12 },
  previousArrow: { color: '#393671', fontSize: 21, marginRight: 8 },
  previousText: { color: '#393671', fontSize: 16, fontWeight: '600' },
  primaryButton: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 12, flex: 1, flexDirection: 'row', justifyContent: 'center', minHeight: 54, paddingHorizontal: 12 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  arrow: { color: '#fff', fontSize: 21, marginLeft: 8 },
  pressed: { opacity: 0.82 },
  skipText: { color: '#5b50f5', fontSize: 16, fontWeight: '600' },
  storageError: { color: '#b42336', fontSize: 12, lineHeight: 18, marginTop: 4, textAlign: 'center' },
});

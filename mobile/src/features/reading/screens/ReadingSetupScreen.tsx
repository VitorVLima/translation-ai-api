import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../../components/ScreenHeader';
import { useDeterministicBack } from '../../../hooks/use-deterministic-back';
import { getBackDestination } from '../../../navigation/back-destinations';
import { getProfile } from '../../profile/profile.service';
import { difficultyForEnglishLevel, getReadingDifficultyCefr, getReadingDifficultyLabel, getReadingTopicLabel, READING_DIFFICULTIES, READING_TOPICS } from '../reading.presentation';
import { generateReading, ReadingRequestError } from '../reading.service';
import type { ReadingDifficulty, ReadingTopic } from '../reading.types';

export function ReadingSetupScreen() {
  const styles = useThemedStyles(baseStyles);
  const [difficulty, setDifficulty] = useState<ReadingDifficulty>('INTERMEDIATE');
  const [topic, setTopic] = useState<ReadingTopic>('RANDOM');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const goBack = useCallback(() => router.replace(getBackDestination('readingSetup')), []);
  useDeterministicBack(goBack);

  useEffect(() => {
    void getProfile().then((profile) => {
      if (mounted.current && profile.englishLevel) setDifficulty(difficultyForEnglishLevel(profile.englishLevel));
    }).catch(() => undefined);
    return () => { mounted.current = false; };
  }, []);

  const submit = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const activity = await generateReading(difficulty, topic);
      if (mounted.current) router.replace(`/practice/reading/${activity.activityId}`);
    } catch (reason) {
      if (!mounted.current) return;
      setGenerating(false);
      if (reason instanceof ReadingRequestError && reason.status === 503) setError('A leitura está indisponível no momento. Tente novamente.');
      else setError('Não foi possível criar sua leitura. Tente novamente.');
    }
  }, [difficulty, generating, topic]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.screen}>
      <View style={styles.header}><ScreenHeader onBack={goBack} title="Nova leitura" /></View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Escolha como quer praticar</Text>
        <Text style={styles.subtitle}>Leia um texto em inglês sobre um tema que combina com você.</Text>
        <Text style={styles.sectionTitle}>Dificuldade</Text>
        <View style={styles.optionsRow}>
          {READING_DIFFICULTIES.map((value) => {
            const selected = value === difficulty;
            return <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Dificuldade ${getReadingDifficultyLabel(value)}`} onPress={() => setDifficulty(value)} style={[styles.option, selected && styles.selectedOption]}>
              <Text style={[styles.optionTitle, selected && styles.selectedText]}>{getReadingDifficultyLabel(value)}</Text>
              <Text style={[styles.optionMeta, selected && styles.selectedMeta]}>{getReadingDifficultyCefr(value)}</Text>
            </Pressable>;
          })}
        </View>
        <Text style={styles.sectionTitle}>Tema</Text>
        <View style={styles.topicGrid}>
          {READING_TOPICS.map((value) => {
            const selected = value === topic;
            return <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={`Tema ${getReadingTopicLabel(value)}`} onPress={() => setTopic(value)} style={[styles.topic, selected && styles.selectedOption]}>
              <Text style={[styles.topicText, selected && styles.selectedText]}>{getReadingTopicLabel(value)}</Text>
            </Pressable>;
          })}
        </View>
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: generating }} disabled={generating} onPress={() => void submit()} style={({ pressed }) => [styles.primary, pressed && styles.pressed, generating && styles.disabled]}>
          {generating ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryText}>Começar leitura</Text>}
        </Pressable>
      </ScrollView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const baseStyles = StyleSheet.create({
  screen: { backgroundColor: '#f8f9ff', flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 2 },
  content: { paddingBottom: 28, paddingHorizontal: 18 },
  title: { color: '#171528', fontSize: 22, fontWeight: '800', marginTop: 10 },
  subtitle: { color: '#68728c', fontSize: 14, lineHeight: 20, marginTop: 5 },
  sectionTitle: { color: '#25213d', fontSize: 15, fontWeight: '800', marginBottom: 9, marginTop: 22 },
  optionsRow: { flexDirection: 'row', gap: 8 },
  option: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e1e4ef', borderRadius: 14, borderWidth: 1, flex: 1, minHeight: 66, justifyContent: 'center', paddingHorizontal: 4 },
  selectedOption: { backgroundColor: '#eeecff', borderColor: '#5b50f5', borderWidth: 1.5 },
  optionTitle: { color: '#292640', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  optionMeta: { color: '#7a849c', fontSize: 11, marginTop: 3 },
  selectedText: { color: '#4f45d8' },
  selectedMeta: { color: '#5b50f5' },
  topicGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topic: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e1e4ef', borderRadius: 13, borderWidth: 1, minHeight: 46, justifyContent: 'center', paddingHorizontal: 12, width: '31.5%' },
  topicText: { color: '#292640', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  error: { color: '#984b58', fontSize: 13, marginTop: 16, textAlign: 'center' },
  primary: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 14, justifyContent: 'center', marginTop: 22, minHeight: 50 },
  primaryText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.7 },
  pressed: { opacity: 0.78 },
});

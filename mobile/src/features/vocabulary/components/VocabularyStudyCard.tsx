import { useThemedStyles } from '../../../theme/useThemedStyles';
import { StyleSheet, Text, View } from 'react-native';
import { VocabularyAudioButton } from './VocabularyAudioButton';
import type { VocabularySpeechKey } from '../audio/use-vocabulary-speech';
import type { DailyVocabularyWord } from '../vocabulary.types';

type VocabularyStudyCardProps = {
  word: DailyVocabularyWord;
  categoryLabel: string | null;
  audioError: string | null;
  activeAudio: VocabularySpeechKey | null;
  loadingAudio: VocabularySpeechKey | null;
  density: 0 | 1 | 2;
  onPlayAudio: (key: VocabularySpeechKey, text: string) => void;
};

export function VocabularyStudyCard({ word, categoryLabel, audioError, activeAudio, loadingAudio, density, onPlayAudio }: VocabularyStudyCardProps) {
  const styles = useThemedStyles(baseStyles);
  return (
    <View style={[styles.card, density > 0 && styles.cardCompact, density === 2 && styles.cardTight]}>
      <View style={styles.wordHeader}>
        <View style={styles.wordHeading}>
          <Text style={styles.word}>{word.word}</Text>
        </View>
        <VocabularyAudioButton
          accessibilityLabel={`Ouvir a palavra ${word.word}`}
          loading={loadingAudio === 'word'}
          onPress={() => onPlayAudio('word', word.word)}
          playing={activeAudio === 'word'}
        />
      </View>
      {categoryLabel ? <Text style={[styles.category, density > 0 && styles.categoryCompact]}>Tema · {categoryLabel}</Text> : null}
      <Text style={[styles.translation, density > 0 && styles.translationCompact, density === 2 && styles.translationTight]}>{word.translation}</Text>
      {word.example ? (
        <View style={[styles.exampleBox, density > 0 && styles.exampleBoxCompact, density === 2 && styles.exampleBoxTight]}>
          <View style={[styles.exampleHeader, density > 0 && styles.exampleHeaderCompact]}>
            <Text style={styles.exampleLabel}>Frase de exemplo</Text>
            <VocabularyAudioButton
              accessibilityLabel="Ouvir frase"
              loading={loadingAudio === 'example'}
              onPress={() => onPlayAudio('example', word.example ?? '')}
              playing={activeAudio === 'example'}
            />
          </View>
          <Text style={styles.example}>{word.example}</Text>
          {word.exampleTranslation ? <Text style={[styles.exampleTranslation, density > 0 && styles.exampleTranslationCompact]}>{word.exampleTranslation}</Text> : null}
        </View>
      ) : <Text style={styles.unavailable}>Frase de exemplo indisponível.</Text>}
      {audioError ? <Text accessibilityLiveRegion="polite" style={styles.audioError}>{audioError}</Text> : null}
    </View>
  );
}

const baseStyles = StyleSheet.create({
  card: { backgroundColor: '#ffffff', borderRadius: 18, elevation: 2, padding: 18, shadowColor: '#a2a9c0', shadowOffset: { height: 4, width: 0 }, shadowOpacity: 0.1, shadowRadius: 11 },
  cardCompact: { paddingVertical: 14 },
  cardTight: { paddingVertical: 11 },
  wordHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  wordHeading: { flex: 1, minWidth: 0, paddingRight: 12 },
  word: { color: '#111b3d', fontSize: 32, fontWeight: '800', letterSpacing: -0.6 },
  translation: { color: '#47536f', fontSize: 20, fontWeight: '600', marginTop: 12 },
  translationCompact: { marginTop: 8 },
  translationTight: { marginTop: 5 },
  category: { alignSelf: 'flex-start', backgroundColor: '#efedff', borderRadius: 9, color: '#5549df', fontSize: 11, fontWeight: '700', marginTop: 8, paddingHorizontal: 9, paddingVertical: 5 },
  categoryCompact: { marginTop: 5, paddingVertical: 4 },
  exampleLabel: { color: '#565f80', fontSize: 13, fontWeight: '800' },
  exampleBox: { backgroundColor: '#f6f5ff', borderRadius: 14, marginTop: 17, padding: 13 },
  exampleBoxCompact: { marginTop: 11, paddingVertical: 10 },
  exampleBoxTight: { marginTop: 7, paddingVertical: 8 },
  exampleHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  exampleHeaderCompact: { marginBottom: 2 },
  example: { color: '#202044', fontSize: 17, fontWeight: '600', lineHeight: 25 },
  exampleTranslation: { color: '#69738e', fontSize: 14, lineHeight: 21, marginTop: 9 },
  exampleTranslationCompact: { marginTop: 5 },
  unavailable: { color: '#7a8092', fontSize: 13 },
  audioError: { color: '#9a4a58', fontSize: 11, marginTop: 7 },
});

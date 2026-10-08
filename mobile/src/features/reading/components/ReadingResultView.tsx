import { useThemedStyles } from '../../../theme/useThemedStyles';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getReadingDifficultyLabel, getReadingQuestionTypeLabel, getReadingResultMessage, isReadingClosedWithoutResult } from '../reading.presentation';
import type { ReadingActivityDetail } from '../reading.types';

type Props = {
  detail: ReadingActivityDetail;
  answers?: Record<string, number>;
  onConclude: () => void;
};

export function ReadingResultView({ detail, answers, onConclude }: Props) {
  const styles = useThemedStyles(baseStyles);
  const withoutResult = isReadingClosedWithoutResult(detail);
  return (
    <View style={styles.container}>
      <View style={styles.resultCard}>
        <Text style={styles.eyebrow}>Resultado da leitura</Text>
        <Text style={styles.title}>{withoutResult ? 'Leitura sem resultado' : detail.status === 'SUCCESS' ? 'Leitura concluída!' : 'Continue praticando'}</Text>
        <Text style={styles.message}>{withoutResult ? 'Esta leitura foi encerrada sem respostas. Não há pontuação de compreensão.' : getReadingResultMessage(detail.status)}</Text>
        <View style={styles.metrics}>
          <View style={styles.metric}><Text style={styles.metricValue}>{detail.correctAnswers ?? '—'}/{detail.questionCount}</Text><Text style={styles.metricLabel}>acertos</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>{detail.comprehensionPercentage === null ? '—' : `${detail.comprehensionPercentage}%`}</Text><Text style={styles.metricLabel}>compreensão</Text></View>
          <View style={styles.metric}><Text style={styles.metricValue}>{getReadingDifficultyLabel(detail.difficulty)}</Text><Text style={styles.metricLabel}>nível</Text></View>
        </View>
      </View>
      <Text style={styles.sectionTitle}>Revisão das perguntas</Text>
      <View style={styles.reviewContent}>
        {detail.questions.map((question, index) => {
          const selected = answers?.[question.id];
          const correct = question.correctOption;
          const hasSelected = typeof selected === 'number';
          const isCorrect = hasSelected && typeof correct === 'number' && selected === correct;
          return (
            <View key={question.id} style={styles.questionCard}>
              <Text style={styles.questionNumber}>Questão {index + 1} · {getReadingQuestionTypeLabel(question.type)}</Text>
              <Text style={styles.questionText}>{question.question}</Text>
              {hasSelected ? <Text style={styles.answerLine}>Sua resposta: {question.options[selected] ?? '—'}</Text> : null}
              {typeof correct === 'number' ? <Text style={styles.answerLine}>Resposta correta: {question.options[correct]}</Text> : null}
              {hasSelected && typeof correct === 'number' ? <Text style={[styles.feedback, isCorrect ? styles.correct : styles.incorrect]}>{isCorrect ? 'Resposta correta' : 'Resposta incorreta'}</Text> : null}
              {question.explanation ? <Text style={styles.explanation}>{question.explanation}</Text> : null}
            </View>
          );
        })}
      </View>
      <Pressable accessibilityRole="button" onPress={onConclude} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
        <Text style={styles.buttonText}>Concluir</Text>
      </Pressable>
    </View>
  );
}

const baseStyles = StyleSheet.create({
  container: { paddingBottom: 20 },
  resultCard: { backgroundColor: '#eeecff', borderRadius: 18, marginTop: 10, padding: 17 },
  eyebrow: { color: '#5b50f5', fontSize: 12, fontWeight: '800' },
  title: { color: '#171528', fontSize: 23, fontWeight: '800', marginTop: 5 },
  message: { color: '#4e5872', fontSize: 14, lineHeight: 20, marginTop: 5 },
  metrics: { flexDirection: 'row', gap: 8, marginTop: 15 },
  metric: { backgroundColor: '#ffffff', borderRadius: 12, flex: 1, minHeight: 59, padding: 8 },
  metricValue: { color: '#292640', fontSize: 15, fontWeight: '800' },
  metricLabel: { color: '#737d96', fontSize: 11, marginTop: 2 },
  sectionTitle: { color: '#25213d', fontSize: 16, fontWeight: '800', marginBottom: 8, marginTop: 18 },
  reviewContent: { gap: 8 },
  questionCard: { backgroundColor: '#ffffff', borderColor: '#e5e7f0', borderRadius: 14, borderWidth: 1, padding: 13 },
  questionNumber: { color: '#5b50f5', fontSize: 11, fontWeight: '800' },
  questionText: { color: '#242136', fontSize: 14, fontWeight: '700', lineHeight: 20, marginTop: 6 },
  answerLine: { color: '#59647e', fontSize: 13, lineHeight: 18, marginTop: 7 },
  feedback: { fontSize: 12, fontWeight: '800', marginTop: 7 },
  correct: { color: '#2f8066' },
  incorrect: { color: '#a15462' },
  explanation: { backgroundColor: '#f5f3ff', borderRadius: 9, color: '#4e5872', fontSize: 12, lineHeight: 18, marginTop: 8, padding: 9 },
  button: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 14, justifyContent: 'center', marginTop: 16, minHeight: 48 },
  buttonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.78 },
});

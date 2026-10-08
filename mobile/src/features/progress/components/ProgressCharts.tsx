import { useThemedStyles } from '../../../theme/useThemedStyles';
import { StyleSheet, Text, View } from 'react-native';
import {
  getProgressMonthLabel,
  getVocabularyDistribution,
  hasActivityEvolution,
  hasPerformanceEvolution,
  progressRatio,
} from '../progress.presentation';
import type { ProgressTimelinePoint, VocabularyProgress } from '../progress.types';

type EmptyChartProps = { message: string };

export function EmptyChart({ message }: EmptyChartProps) {
  const styles = useThemedStyles(baseStyles);
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

export function ActivityEvolutionChart({ points }: { points: ProgressTimelinePoint[] }) {
  const styles = useThemedStyles(baseStyles);
  if (!hasActivityEvolution(points)) {
    return <EmptyChart message="Pratique para começar a acompanhar sua evolução ao longo do tempo." />;
  }
  const maximum = Math.max(...points.flatMap((point) => [point.conversation.count, point.reading.count, point.vocabulary.wordsFirstSeen]), 1);
  const label = points.map((point) => `${point.period}: ${point.conversation.count} conversas, ${point.reading.count} leituras e ${point.vocabulary.wordsFirstSeen} palavras`).join('. ');
  return (
    <View accessibilityLabel={`Atividades por mês. ${label}`} accessibilityRole="image">
      <View style={styles.legend}>
        <Legend color="#6b5cff" label="Conversas" />
        <Legend color="#35a7d7" label="Leituras" />
        <Legend color="#2da66f" label="Palavras" />
      </View>
      <View style={styles.chart}>
        {points.map((point) => (
          <View key={point.period} style={styles.chartGroup}>
            <View style={styles.bars}>
              <Bar color="#6b5cff" ratio={progressRatio(point.conversation.count, maximum)} value={point.conversation.count} />
              <Bar color="#35a7d7" ratio={progressRatio(point.reading.count, maximum)} value={point.reading.count} />
              <Bar color="#2da66f" ratio={progressRatio(point.vocabulary.wordsFirstSeen, maximum)} value={point.vocabulary.wordsFirstSeen} />
            </View>
            <Text style={styles.axisLabel}>{getProgressMonthLabel(point.period)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function PerformanceEvolutionChart({ points }: { points: ProgressTimelinePoint[] }) {
  const styles = useThemedStyles(baseStyles);
  if (!hasPerformanceEvolution(points)) {
    return <EmptyChart message="Ainda não há histórico suficiente para mostrar evolução de notas." />;
  }
  const label = points.map((point) => `${point.period}: conversação ${point.conversation.average === null ? 'sem nota' : `${Math.round(point.conversation.average)}%`}, leitura ${point.reading.average === null ? 'sem nota' : `${Math.round(point.reading.average)}%`}`).join('. ');
  return (
    <View accessibilityLabel={`Notas médias por mês. ${label}`} accessibilityRole="image">
      <View style={styles.legend}>
        <Legend color="#6b5cff" label="Conversação" />
        <Legend color="#35a7d7" label="Leitura" />
      </View>
      <View style={styles.chart}>
        {points.map((point) => (
          <View key={point.period} style={styles.chartGroup}>
            <View style={styles.bars}>
              <ScoreBar color="#6b5cff" value={point.conversation.average} />
              <ScoreBar color="#35a7d7" value={point.reading.average} />
            </View>
            <Text style={styles.axisLabel}>{getProgressMonthLabel(point.period)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.scaleRow}><Text style={styles.scaleText}>0</Text><Text style={styles.scaleText}>Notas de 0 a 100</Text><Text style={styles.scaleText}>100</Text></View>
    </View>
  );
}

export function VocabularyDistributionChart({ vocabulary }: { vocabulary: VocabularyProgress }) {
  const styles = useThemedStyles(baseStyles);
  if (vocabulary.totalWords === 0) {
    return <EmptyChart message="As palavras aparecerão aqui conforme você praticar vocabulário." />;
  }
  return (
    <View accessibilityLabel="Distribuição atual do vocabulário" accessibilityRole="image" style={styles.distribution}>
      {getVocabularyDistribution(vocabulary).map((item) => (
        <View key={item.key} style={styles.distributionRow}>
          <View style={styles.distributionHeading}>
            <View style={styles.distributionLabel}><View style={[styles.legendDot, { backgroundColor: item.color }]} /><Text style={styles.distributionText}>{item.label}</Text></View>
            <Text style={styles.distributionValue}>{item.value}</Text>
          </View>
          <View style={styles.track}><View style={[styles.fill, { backgroundColor: item.color, width: `${progressRatio(item.value, vocabulary.totalWords) * 100}%` }]} /></View>
        </View>
      ))}
    </View>
  );
}

export function ScoreProgressBar({ color = '#6b5cff', label, value }: { color?: string; label: string; value: number | null }) {
  const styles = useThemedStyles(baseStyles);
  return (
    <View style={styles.scoreRow}>
      <View style={styles.scoreHeading}><Text style={styles.scoreLabel}>{label}</Text><Text style={styles.scoreValue}>{value === null ? 'Sem dados' : `${Math.round(value)}%`}</Text></View>
      <View style={styles.track}><View style={[styles.fill, { backgroundColor: color, width: `${progressRatio(value ?? 0, 100) * 100}%` }]} /></View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  const styles = useThemedStyles(baseStyles);
  return <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>;
}

function Bar({ color, ratio, value }: { color: string; ratio: number; value: number }) {
  const styles = useThemedStyles(baseStyles);
  return <View accessibilityLabel={`${value}`} style={[styles.bar, { backgroundColor: color, height: value === 0 ? 2 : Math.max(6, ratio * 76) }]} />;
}

function ScoreBar({ color, value }: { color: string; value: number | null }) {
  const styles = useThemedStyles(baseStyles);
  return <View style={[styles.bar, value === null && styles.missingBar, { backgroundColor: value === null ? '#e6e8f0' : color, height: value === null ? 2 : Math.max(6, progressRatio(value, 100) * 76) }]} />;
}

const baseStyles = StyleSheet.create({
  empty: { alignItems: 'center', backgroundColor: '#f7f8fd', borderRadius: 12, justifyContent: 'center', minHeight: 88, paddingHorizontal: 18, paddingVertical: 18 },
  emptyText: { color: '#6f7487', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  legendDot: { borderRadius: 4, height: 7, width: 7 },
  legendText: { color: '#666d83', fontSize: 10.5, fontWeight: '600' },
  chart: { alignItems: 'flex-end', borderBottomColor: '#dfe3ee', borderBottomWidth: 1, flexDirection: 'row', height: 102 },
  chartGroup: { alignItems: 'center', flex: 1, minWidth: 0 },
  bars: { alignItems: 'flex-end', flexDirection: 'row', gap: 3, height: 80, justifyContent: 'center' },
  bar: { borderRadius: 4, width: 6 },
  missingBar: { opacity: 0.8 },
  axisLabel: { color: '#747a8d', fontSize: 9, marginTop: 6 },
  scaleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  scaleText: { color: '#8a90a2', fontSize: 8.5 },
  distribution: { gap: 11 },
  distributionRow: { gap: 5 },
  distributionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  distributionLabel: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  distributionText: { color: '#3f4355', fontSize: 11.5, fontWeight: '600' },
  distributionValue: { color: '#171528', fontSize: 11.5, fontWeight: '800' },
  track: { backgroundColor: '#e9ebf3', borderRadius: 5, height: 7, overflow: 'hidden' },
  fill: { borderRadius: 5, height: '100%' },
  scoreRow: { gap: 5 },
  scoreHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  scoreLabel: { color: '#42475a', fontSize: 11.5, fontWeight: '600' },
  scoreValue: { color: '#555b70', fontSize: 10.5, fontWeight: '700' },
});

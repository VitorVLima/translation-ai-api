import { useThemedStyles } from '../../../theme/useThemedStyles';
import { useState } from 'react';
import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { getEvaluationScorePresentation, getEvaluationScoreTone, getEvaluationStatusPresentation } from '../conversations.presentation';
import type { ConversationEvaluation } from '../conversations.types';

type ConversationEvaluationCardProps = {
  evaluation: ConversationEvaluation;
  onMinimize: () => void;
  onNewConversation: () => void;
  onBackToConversations: () => void;
};

export function ConversationEvaluationCard({
  evaluation,
  onMinimize,
  onNewConversation,
  onBackToConversations,
}: ConversationEvaluationCardProps) {
  const styles = useThemedStyles(baseStyles);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const presentation = getEvaluationStatusPresentation(evaluation.status);
  const scores = getEvaluationScorePresentation(evaluation.scores);
  const overall = evaluation.scores?.overall;

  return (
    <View accessibilityViewIsModal style={styles.overlay}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <View>
              <Text style={styles.eyebrow}>SUA AVALIAÇÃO</Text>
              <Text style={styles.title}>{presentation.title}</Text>
            </View>
            <Pressable
              accessibilityLabel="Minimizar avaliação"
              accessibilityRole="button"
              onPress={onMinimize}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <SymbolView accessible={false} name={{ ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={23} tintColor="#5b50f5" />
            </Pressable>
          </View>
          <Text style={styles.description}>{presentation.description}</Text>
          {typeof overall === 'number' ? <View style={styles.overall}>
            <EvaluationScoreRing value={overall} />
            <Text style={styles.overallLabel}>Resultado geral</Text>
          </View> : null}
          {scores.length ? (
            <View style={styles.metrics}>
              {scores.map((score) => <View key={score.key} accessibilityLabel={`${score.label}: ${score.value === null ? 'sem nota' : `${score.value} de 100`}`} style={styles.metric}>
                <Text style={styles.metricLabel}>{score.label}</Text>
                <View style={styles.metricTrack}>
                  {score.value !== null ? <View style={[styles.metricFill, {
                    backgroundColor: SCORE_COLORS[getEvaluationScoreTone(score.value)],
                    width: `${Math.max(0, Math.min(100, score.value))}%`,
                  }]} /> : null}
                </View>
                <Text style={styles.metricValue}>{score.value === null ? '—' : score.value}</Text>
              </View>)}
            </View>
          ) : null}
          <Pressable accessibilityLabel={detailsExpanded ? 'Ocultar detalhes' : 'Ver detalhes'} accessibilityRole="button"
            accessibilityState={{ expanded: detailsExpanded }} onPress={() => setDetailsExpanded((current) => !current)}
            style={({ pressed }) => [styles.detailsToggle, pressed && styles.pressed]}>
            <Text style={styles.detailsToggleText}>{detailsExpanded ? 'Ocultar detalhes' : 'Ver detalhes'}</Text>
            <SymbolView accessible={false} name={detailsExpanded
              ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' }
              : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={18} tintColor="#5146d6" />
          </Pressable>
          {detailsExpanded ? <>
            {evaluation.strengths?.length ? <FeedbackList icon={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }} items={evaluation.strengths} title="Pontos fortes" tone="positive" /> : null}
            {evaluation.improvements?.length ? <FeedbackList icon={{ ios: 'arrow.up.right.circle.fill', android: 'north_east', web: 'north_east' }} items={evaluation.improvements} title="O que melhorar" tone="improvement" /> : null}
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" onPress={onNewConversation} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}><Text style={styles.primaryActionText}>Nova conversa</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={onBackToConversations} style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}><Text style={styles.secondaryActionText}>Ver conversas</Text></Pressable>
            </View>
          </> : null}
        </View>
      </ScrollView>
    </View>
  );
}

export function CollapsedConversationEvaluationBar({ onExpand }: { onExpand: () => void }) {
  const styles = useThemedStyles(baseStyles);
  return (
    <Pressable accessibilityLabel="Ver avaliação" accessibilityRole="button" accessibilityState={{ expanded: false }} onPress={onExpand} style={({ pressed }) => [styles.collapsedBar, pressed && styles.pressed]}>
      <Text style={styles.collapsedText}>Ver avaliação</Text>
      <SymbolView accessible={false} name={{ ios: 'chevron.up', android: 'expand_less', web: 'expand_less' }} size={21} tintColor="#5146d6" />
    </Pressable>
  );
}

const RING_SIZE = 96;
const SCORE_COLORS = { positive: '#3c8360', negative: '#8f3c42' } as const;

function EvaluationScoreRing({ value }: { value: number }) {
  const styles = useThemedStyles(baseStyles);
  const angle = Math.max(0, Math.min(100, value)) * 3.6;
  const color = SCORE_COLORS[getEvaluationScoreTone(value)];
  // Clipped half-rings reveal a continuous arc from 12 o'clock, clockwise.
  const rightArcStyle = { borderTopColor: color, borderRightColor: color, transform: [{ rotate: `${Math.min(angle, 180) - 135}deg` }] };
  const leftArcStyle = { borderTopColor: color, borderRightColor: color, transform: [{ rotate: `${angle - 135}deg` }] };
  return <View accessibilityRole="image" accessibilityLabel={`Resultado geral: ${value} de 100`} style={styles.ring}>
    <View style={styles.ringTrack} />
    {angle > 0 ? <View style={styles.ringRightClip}><View style={[styles.ringRightArc, rightArcStyle]} /></View> : null}
    {angle > 180 ? <View style={styles.ringLeftClip}><View style={[styles.ringLeftArc, leftArcStyle]} /></View> : null}
    <View style={styles.ringCenter}>
      <Text style={styles.overallValue}>{value}</Text>
      <Text style={styles.outOf}>/100</Text>
    </View>
  </View>;
}

function FeedbackList({ icon, items, title, tone }: { icon: SymbolViewProps['name']; items: string[]; title: string; tone: 'positive' | 'improvement' }) {
  const styles = useThemedStyles(baseStyles);
  const color = tone === 'positive' ? '#3c8360' : '#a66c22';
  return <View style={styles.feedback}><Text style={styles.feedbackTitle}>{title}</Text>{items.map((item, index) => <View key={`${title}-${index}`} style={styles.feedbackItem}><SymbolView accessible={false} name={icon} size={15} tintColor={color} /><Text style={styles.feedbackText}>{item}</Text></View>)}</View>;
}

const baseStyles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: '#f8f9ff', zIndex: 4 },
  scrollContent: { padding: 14, paddingBottom: 28 },
  panel: { backgroundColor: '#ffffff', borderColor: '#e3e0f1', borderRadius: 20, borderWidth: 1, padding: 15 },
  panelHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 40 },
  eyebrow: { color: '#756dbb', fontSize: 9.5, fontWeight: '800', letterSpacing: 0.7 },
  title: { color: '#262337', fontSize: 18, fontWeight: '800', marginTop: 2 },
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  description: { color: '#666277', fontSize: 11.5, lineHeight: 16, marginTop: 6 },
  overall: { alignItems: 'center', marginTop: 13 },
  overallValue: { color: '#5146d6', fontSize: 28, fontWeight: '800', lineHeight: 31 },
  outOf: { color: '#8a84a5', fontSize: 10, lineHeight: 12 },
  overallLabel: { color: '#625d78', fontSize: 11, fontWeight: '700', marginTop: 5 },
  metrics: { gap: 7, marginTop: 13 },
  metric: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 22 },
  metricLabel: { color: '#565165', fontSize: 11, fontWeight: '700', width: 92 },
  metricTrack: { backgroundColor: '#e9e7f4', borderRadius: 4, flex: 1, height: 6, overflow: 'hidden' },
  metricFill: { borderRadius: 4, height: 6 },
  metricValue: { color: '#353146', fontSize: 11.5, fontWeight: '800', textAlign: 'right', width: 26 },
  ring: { height: RING_SIZE, width: RING_SIZE },
  ringTrack: { ...StyleSheet.absoluteFill, borderColor: '#e9e7f4', borderRadius: RING_SIZE / 2, borderWidth: 6 },
  ringRightClip: { height: RING_SIZE, left: RING_SIZE / 2, overflow: 'hidden', position: 'absolute', top: 0, width: RING_SIZE / 2 },
  ringLeftClip: { height: RING_SIZE, left: 0, overflow: 'hidden', position: 'absolute', top: 0, width: RING_SIZE / 2 },
  ringRightArc: { borderBottomColor: 'transparent', borderLeftColor: 'transparent', borderRadius: RING_SIZE / 2, borderWidth: 6,
    height: RING_SIZE, left: -RING_SIZE / 2, position: 'absolute', top: 0, width: RING_SIZE },
  ringLeftArc: { borderBottomColor: 'transparent', borderLeftColor: 'transparent', borderRadius: RING_SIZE / 2, borderWidth: 6,
    height: RING_SIZE, left: 0, position: 'absolute', top: 0, width: RING_SIZE },
  ringCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  detailsToggle: { alignItems: 'center', alignSelf: 'center', borderColor: '#e0dcf2', borderRadius: 10, borderWidth: 1,
    flexDirection: 'row', gap: 5, justifyContent: 'center', marginTop: 13, minHeight: 40, paddingHorizontal: 15 },
  detailsToggleText: { color: '#5146d6', fontSize: 11.5, fontWeight: '800' },
  feedback: { marginTop: 16 },
  feedbackTitle: { color: '#2e2a40', fontSize: 13, fontWeight: '800', marginBottom: 7 },
  feedbackItem: { alignItems: 'flex-start', flexDirection: 'row', gap: 7, marginTop: 6 },
  feedbackText: { color: '#5f5a70', flex: 1, fontSize: 11.5, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 16 },
  primaryAction: { alignItems: 'center', backgroundColor: '#5b50f5', borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 10 },
  primaryActionText: { color: '#ffffff', fontSize: 11.5, fontWeight: '800' },
  secondaryAction: { alignItems: 'center', borderColor: '#d7d3eb', borderRadius: 10, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 10 },
  secondaryActionText: { color: '#5146d6', fontSize: 11.5, fontWeight: '800' },
  collapsedBar: { alignItems: 'center', backgroundColor: '#ffffff', borderBottomColor: '#e5e3f0', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 48, paddingHorizontal: 16 },
  collapsedText: { color: '#5146d6', fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});

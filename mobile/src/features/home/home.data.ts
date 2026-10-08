import type { ConversationSummary } from '../conversations/conversations.types';
import type { HomeProfileData } from '../profile/profile.service';
import type { ProgressData } from '../progress/progress.types';
import type { DailyVocabularyLesson } from '../vocabulary/vocabulary.types';

export type HomeData = {
  conversations: ConversationSummary[];
  profile: HomeProfileData;
  progress: ProgressData;
  vocabulary: DailyVocabularyLesson;
};

export type HomeDataResults = readonly [
  PromiseSettledResult<HomeProfileData>,
  PromiseSettledResult<DailyVocabularyLesson>,
  PromiseSettledResult<ProgressData>,
  PromiseSettledResult<ConversationSummary[]>,
];

export function mergeHomeData(previous: HomeData | null, results: HomeDataResults): HomeData | null {
  const [profile, vocabulary, progress, conversations] = results;
  if (!previous && results.some((result) => result.status === 'rejected')) return null;

  return {
    conversations: conversations.status === 'fulfilled' ? conversations.value : previous!.conversations,
    profile: profile.status === 'fulfilled' ? profile.value : previous!.profile,
    progress: progress.status === 'fulfilled' ? progress.value : previous!.progress,
    vocabulary: vocabulary.status === 'fulfilled' ? vocabulary.value : previous!.vocabulary,
  };
}

export function hasHomeDataFailures(results: HomeDataResults): boolean {
  return results.some((result) => result.status === 'rejected');
}

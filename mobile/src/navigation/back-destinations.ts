export type BackDestination = 'practice' | 'reading' | 'readingActivity' | 'readingSetup' | 'conversations' | 'progress' | 'profile' | 'newConversation' | 'conversation';

const DESTINATIONS: Record<BackDestination, string> = {
  practice: '/',
  reading: '/practice',
  readingActivity: '/practice/reading',
  readingSetup: '/practice/reading',
  conversations: '/',
  progress: '/',
  profile: '/',
  newConversation: '/conversations',
  conversation: '/conversations',
};

export function getBackDestination(screen: BackDestination): string {
  return DESTINATIONS[screen];
}

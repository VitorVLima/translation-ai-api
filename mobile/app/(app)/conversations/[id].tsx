import { useLocalSearchParams } from 'expo-router';
import { isConversationId } from '../../../src/features/conversations/conversations.presentation';
import { ConversationScreen } from '../../../src/features/conversations/screens/ConversationScreen';

export default function ConversationRoute() {
  const params = useLocalSearchParams<{ id?: string | string[]; playOpening?: string | string[] }>();
  const id = typeof params.id === 'string' && isConversationId(params.id) ? params.id : null;
  return <ConversationScreen conversationId={id} playOpening={params.playOpening === 'true'} />;
}

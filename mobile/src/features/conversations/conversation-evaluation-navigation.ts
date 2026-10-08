export function handleConversationBack(
  evaluationExpanded: boolean,
  closeEvaluation: () => void,
  goToConversations: () => void,
): boolean {
  if (evaluationExpanded) {
    closeEvaluation();
    return false;
  }
  goToConversations();
  return true;
}

export function isNearConversationEnd(contentHeight: number, viewportHeight: number, offsetY: number): boolean {
  if (viewportHeight <= 0) return true;
  const distanceFromEnd = Math.max(0, contentHeight - viewportHeight - offsetY);
  return distanceFromEnd <= viewportHeight * 0.2;
}

export function isAtConversationEnd(contentHeight: number, viewportHeight: number, offsetY: number): boolean {
  return Math.max(0, contentHeight - viewportHeight - offsetY) <= 1;
}

export function isConversationLayoutReady(contentHeight: number, viewportHeight: number): boolean {
  return contentHeight > 0 && viewportHeight > 0;
}

export function updateConversationPin(pinned: boolean, manualScrolling: boolean, contentHeight: number, viewportHeight: number, offsetY: number): boolean {
  return manualScrolling ? isNearConversationEnd(contentHeight, viewportHeight, offsetY) : pinned;
}

export function shouldKeepConversationAtBottom(pinned: boolean, manualScrolling: boolean, contentHeight: number, viewportHeight: number): boolean {
  return pinned && !manualScrolling && isConversationLayoutReady(contentHeight, viewportHeight);
}

/** First-card welcome is only for a finished, empty, successful load. */
export function shouldShowFirstCardWelcome(input: {
  cardCount: number;
  ready: boolean;
  syncError?: string | null;
}): boolean {
  return input.ready && input.cardCount === 0 && !input.syncError;
}

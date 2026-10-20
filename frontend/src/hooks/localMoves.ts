/**
 * Card moves made by *this tab*. The live socket skips the refetch for a `card.moved` event only
 * when it echoes one of these (the tab already applied the server's BoardDetail). Matching on
 * actor_id alone is not enough: the same user can move cards from another tab or through an MCP
 * client (Claude acting with the user's token), and those moves must still show up here.
 */
const ECHO_WINDOW_MS = 10_000;
const recent = new Map<number, number>(); // cardId -> timestamp

export function rememberLocalMove(cardId: number): void {
  recent.set(cardId, Date.now());
}

/** True (once) if a card.moved event for this card is the echo of a move this tab made. */
export function consumeLocalMove(cardId: number | null): boolean {
  if (cardId === null) return false;
  const at = recent.get(cardId);
  if (at === undefined) return false;
  recent.delete(cardId);
  return Date.now() - at <= ECHO_WINDOW_MS;
}

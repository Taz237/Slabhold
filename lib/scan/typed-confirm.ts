import { takeScanMiss } from "@/lib/capture";
import { confirmKeyOf, type ClosestCard } from "./closest";

/**
 * A card typed in after a miss. The scan read a player and found no card, the collector added it
 * step by step, and it saved: what they typed is sent as a confirmation, so the next scan that
 * reads the same finds it. Only for the player the scan read (a card typed for someone else is
 * not that read's card), and the server only keeps it when our checklists have that card for that
 * player. Fire and forget: a failure is silent and never touches the save.
 */
export function typedCardAfterMiss(card: { playerName: string; sport: string; yearLabel: string; setBrand: string; cardNumber: string }, readKey: string | null): { key: string; card: ClosestCard } | null {
  if (!readKey) return null;
  const typed: ClosestCard = {
    playerName: card.playerName.trim(),
    sport: card.sport.trim(),
    yearLabel: card.yearLabel.trim(),
    setBrand: card.setBrand.trim(),
    cardNumber: card.cardNumber.trim().replace(/^#/, ""),
  };
  if (!typed.playerName || !typed.yearLabel || !typed.setBrand || !typed.cardNumber) return null;
  return confirmKeyOf(typed) === readKey ? { key: readKey, card: typed } : null;
}

/** Sends the typed card for the pending miss, if there is one. The miss is used up either way. */
export function confirmTypedCard(card: Parameters<typeof typedCardAfterMiss>[0]): void {
  const pending = typedCardAfterMiss(card, takeScanMiss());
  if (!pending) return;
  void fetch("/api/scan/confirmed", { method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store", keepalive: true, body: JSON.stringify(pending) }).catch(() => {});
}

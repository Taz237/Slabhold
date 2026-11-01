/**
 * Resolves player links off the main thread. Loading the directory and
 * indexing thousands of names otherwise blocks the card page for a few
 * hundred milliseconds on a phone. Started by components/resolved-player-name.
 */
import { CARD_CATALOG } from "@/lib/card-catalog";
import directory from "./directory.json";
import { answerPlayerLinks, linkRoster, type PlayerLinkReply, type PlayerLinkRequest } from "./player-link-roster";
import type { PlayerRef } from "./slug";

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PlayerLinkRequest[]>) => void) | null;
  postMessage(message: PlayerLinkReply[]): void;
};

let roster: PlayerRef[] | null = null;

scope.onmessage = (event) => {
  roster ??= linkRoster(directory as { name: string; sport: string }[], CARD_CATALOG);
  scope.postMessage(answerPlayerLinks(event.data, roster));
};

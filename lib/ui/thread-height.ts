/**
 * The DM thread's height. Closed keyboard: the screen under the header, above
 * the tabs. Open (the iOS app keeps the web view full height, so 100dvh never
 * shrinks): it ends at the keyboard's top edge, which covers the tabs, so the
 * composer always sits right on the keyboard. Same keyboard source as the post
 * composer (lib/ui/use-keyboard-inset.ts).
 */
/** Within this many px of the newest message, the reader counts as "at the bottom". */
export const THREAD_PIN_SLACK_PX = 80;

/** True while the newest message is on screen (or nearly), so new content should keep it there. */
export function threadAtBottom(box: { scrollTop: number; scrollHeight: number; clientHeight: number }): boolean {
  return box.scrollHeight - box.scrollTop - box.clientHeight <= THREAD_PIN_SLACK_PX;
}

/**
 * Whether a new message moves the thread to the bottom: always on open and
 * for your own message, otherwise only when you were already there. Reading
 * older messages is never yanked down by an incoming one.
 */
export function followsNewMessage(input: { first: boolean; pinned: boolean; own: boolean }): boolean {
  return input.first || input.own || input.pinned;
}

export function threadHeight(keyboardInset: number): string {
  if (keyboardInset <= 0) {
    return "calc(100dvh - 3.5rem - 6.15rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))";
  }
  return `calc(100dvh - 3.5rem - env(safe-area-inset-top) - max(${Math.round(keyboardInset)}px, 6.15rem + env(safe-area-inset-bottom)))`;
}

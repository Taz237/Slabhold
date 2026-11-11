/**
 * The DM thread's height. Closed keyboard: the screen under the header, above
 * the tabs. Open (the iOS app keeps the web view full height, so 100dvh never
 * shrinks): it ends at the keyboard's top edge, which covers the tabs, so the
 * composer always sits right on the keyboard. Same keyboard source as the post
 * composer (lib/ui/use-keyboard-inset.ts).
 */
export function threadHeight(keyboardInset: number): string {
  if (keyboardInset <= 0) {
    return "calc(100dvh - 3.5rem - 6.15rem - env(safe-area-inset-top) - env(safe-area-inset-bottom))";
  }
  return `calc(100dvh - 3.5rem - env(safe-area-inset-top) - max(${Math.round(keyboardInset)}px, 6.15rem + env(safe-area-inset-bottom)))`;
}

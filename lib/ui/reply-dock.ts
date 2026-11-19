/**
 * Where the Post page's reply box sits. Keyboard down: above the floating tab
 * bar. Keyboard up: the tab bar is hidden, so the box rests right on the keys,
 * lifted only by the measured inset (lib/ui/use-keyboard-inset.ts), with no
 * safe-area or tab-bar room added on top.
 */
export function replyDockStyle(keyboard: { inset: number; keyboardOpen: boolean }): { bottom: string } {
  if (keyboard.keyboardOpen) return { bottom: `${Math.max(0, Math.round(keyboard.inset))}px` };
  return { bottom: "calc(6.15rem + env(safe-area-inset-bottom))" };
}

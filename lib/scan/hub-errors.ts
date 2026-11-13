/**
 * What the scan screen says in the iPhone app when the scanner didn't load.
 * Its own file, loaded only with the scan screen, so the shared pages stay small.
 */
export const HUB_ERRORS = {
  scannerDown: "The scanner couldn't start. Choose a photo or type the card in.",
  compScannerDown: "The scanner couldn't start. Find the card by name to see sold prices.",
} as const;

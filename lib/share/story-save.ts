/**
 * How "Save for Stories" hands over the 1080×1920 image:
 * - share-files: the native sheet with the PNG attached (iPhone: Save Image, Instagram).
 * - open: iPhone without file sharing. A download there lands in Files, so open the image to long-press.
 * - download: everywhere else, a normal file download.
 */
export type StorySaveMethod = "share-files" | "open" | "download";

export function storySaveMethod(input: { canShareFiles: boolean; ios: boolean }): StorySaveMethod {
  if (input.canShareFiles) return "share-files";
  return input.ios ? "open" : "download";
}

/** iPhone, iPad, or an iPad asking for the desktop site. */
export function isIosDevice(input: { userAgent: string; platform?: string; maxTouchPoints?: number }): boolean {
  if (/iPhone|iPad|iPod/i.test(input.userAgent)) return true;
  return input.platform === "MacIntel" && (input.maxTouchPoints ?? 0) > 1;
}

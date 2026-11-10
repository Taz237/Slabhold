import { trackEvent } from "@/lib/analytics";
import { isNativeApp, loadNative } from "@/lib/ios/platform";
import { isShareAbort } from "@/lib/share/sheet";
import { isIosDevice, storySaveMethod } from "@/lib/share/story-save";

export type ShareImageInput = {
  blob: Blob;
  /** The saved file's name, as in "slabhold-collection.png". */
  filename: string;
  /** The share sheet's title. */
  title: string;
  /** The image's own URL, opened when the sheet can't take the file. */
  src: string;
  /** The analytics source, as in "collection". */
  source: string;
};

type NativeShareFiles = {
  shareFilesNative(input: { files: File[]; text?: string }): Promise<"shared" | "cancelled" | "unavailable">;
};

/** Seams for tests. The app check and the native loader. */
export type ShareImageDeps = {
  isNativeApp: () => boolean;
  loadNative: () => Promise<NativeShareFiles>;
};

const defaultDeps: ShareImageDeps = { isNativeApp, loadNative };

/**
 * The one way we share an image (the collection chart, the Story image).
 * In the iOS app (build 4 and up): the iPhone share sheet with Save Image,
 * Instagram and Messages. Older builds and the web: the browser's share
 * sheet with the PNG, or open it, or download it, as storySaveMethod says.
 */
export async function shareImage(input: ShareImageInput, deps: ShareImageDeps = defaultDeps): Promise<void> {
  const file = new File([input.blob], input.filename, { type: "image/png" });
  if (deps.isNativeApp()) {
    let outcome: "shared" | "cancelled" | "unavailable" = "unavailable";
    try {
      // The image alone: a caption next to it hides some apps' share targets.
      outcome = await (await deps.loadNative()).shareFilesNative({ files: [file] });
    } catch {
      outcome = "unavailable";
    }
    if (outcome === "shared") {
      trackEvent("share", { source: input.source, method: "image" });
      return;
    }
    if (outcome === "cancelled") return;
  }
  await shareImageOnWeb(input, file);
}

/** Today's web behavior, word for word from the two share buttons. */
async function shareImageOnWeb(input: ShareImageInput, file: File): Promise<void> {
  const { blob, filename, title, src, source } = input;
  const method = storySaveMethod({
    canShareFiles: typeof navigator.canShare === "function" && navigator.canShare({ files: [file] }),
    ios: isIosDevice({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints }),
  });
  if (method === "share-files") {
    try {
      await navigator.share({ files: [file], title });
      trackEvent("share", { source, method: "image" });
    } catch (error) {
      // The tap's permission ran out while the image loaded: open it instead.
      if (!isShareAbort(error)) window.open(src, "_blank", "noopener");
    }
    return;
  }
  if (method === "open") {
    window.open(src, "_blank", "noopener");
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  trackEvent("share", { source, method: "image" });
}

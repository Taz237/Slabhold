import { shakeOffset, type Hit, type HitPlan } from "../hit";
import { createHitFx, type HitFx } from "./engine";
import { hitFrame } from "./timeline";

/**
 * The replay and the share clip: one 9:16 picture, 720×1280, drawn the same way for both, so the
 * clip that is saved is exactly what played. The effect and the collector's real card come from the
 * renderer (engine.ts); the card's name and the Slabhold logo are drawn under it. Nothing is added
 * to the card itself.
 */

export const CLIP = { width: 720, height: 1280, ms: 4000, fps: 30, leadMs: 350 } as const;

/** Where the card stands in the clip. */
const CARD = { x: 170, y: 232, w: 380, h: 532 } as const;
/** The clip is drawn 720 wide; the reveal's shake is sized for a 390 wide phone. */
const SHAKE_SCALE = CLIP.width / 390;

/** What the clip says under the card: only what the scan really read. */
export type ClipText = { player: string; set: string; tag: string; first: string | null };

export type HitStage = {
  /** Draw the picture `ms` after the replay started. */
  draw(ms: number): void;
  dispose(): void;
};

export function createHitStage(options: {
  canvas: HTMLCanvasElement;
  photo: HTMLImageElement;
  logo: HTMLImageElement | null;
  hit: Hit;
  plan: HitPlan;
  text: ClipText;
  /** The page's own fonts (Geist and Geist Mono), by their loaded family names. */
  sans: string;
  mono: string;
  /** Reduce Motion: no shake. */
  still?: boolean;
}): HitStage {
  const { canvas, hit, plan, text } = options;
  canvas.width = CLIP.width;
  canvas.height = CLIP.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("hit-fx: no 2d canvas");
  const layer = document.createElement("canvas");
  const fx: HitFx = createHitFx({
    canvas: layer,
    photo: options.photo,
    effect: hit.effect,
    strength: hit.strength,
    width: CLIP.width,
    height: CLIP.height,
    card: CARD,
    scale: 1,
    scene: true,
  });

  const line = (value: string, y: number, font: string, color: string, alpha: number) => {
    if (!value || alpha <= 0) return;
    context.globalAlpha = alpha;
    context.font = font;
    context.fillStyle = color;
    // A long name shrinks to fit; it is never cut.
    const width = context.measureText(value).width;
    const fit = Math.min(1, (CLIP.width - 96) / Math.max(1, width));
    context.save();
    context.translate(CLIP.width / 2, y);
    context.scale(fit, fit);
    context.fillText(value, 0, 0);
    context.restore();
    context.globalAlpha = 1;
  };

  return {
    draw(ms) {
      const at = Math.max(0, ms - CLIP.leadMs);
      fx.render(hitFrame(hit.effect, plan, at, 0.32), at / 1000);
      const shake = options.still ? { x: 0, y: 0 } : shakeOffset(at - plan.impactMs, plan.shakePx);
      context.globalAlpha = 1;
      context.fillStyle = "#09090b";
      context.fillRect(0, 0, CLIP.width, CLIP.height);
      context.drawImage(layer, shake.x * SHAKE_SCALE, shake.y * SHAKE_SCALE);
      context.textAlign = "center";
      context.textBaseline = "alphabetic";
      const shown = Math.min(1, Math.max(0, (at - plan.impactMs - 120) / 320));
      line(text.first ?? "", 176, `500 28px ${options.sans}`, "#A78BFA", shown);
      line(text.player, 872, `600 46px ${options.sans}`, "#F4F4F5", shown);
      line(text.set, 924, `400 28px ${options.sans}`, "#D4D4D8", Math.min(1, Math.max(0, (at - plan.impactMs - 220) / 320)));
      line(text.tag, 974, `500 26px ${options.mono}`, "#A78BFA", Math.min(1, Math.max(0, (at - plan.impactMs - 320) / 320)));
      if (options.logo) context.drawImage(options.logo, CLIP.width / 2 - 36, 1118, 72, 72);
    },
    dispose() {
      fx.dispose();
      canvas.width = 0;
      canvas.height = 0;
    },
  };
}

/** The video types to try, the ones IG and TikTok take first. */
export const CLIP_TYPES = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"] as const;

/** The first video type this browser can record, or null. */
export function clipType(supported: (type: string) => boolean): string | null {
  return CLIP_TYPES.find((type) => supported(type)) ?? null;
}

export function clipFileName(type: string): string {
  return `slabhold-hit.${type.startsWith("video/mp4") ? "mp4" : "webm"}`;
}

export type ClipRecording = { stop(): Promise<File> };

/** Starts recording the canvas. The caller keeps drawing it, then stops after CLIP.ms. */
export function recordClip(canvas: HTMLCanvasElement): ClipRecording {
  const type = clipType((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!type) throw new Error("hit-fx: no recorder");
  const stream = canvas.captureStream(CLIP.fps);
  const recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 6_000_000 });
  const parts: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) parts.push(event.data);
  };
  recorder.start();
  return {
    stop: () =>
      new Promise<File>((resolve, reject) => {
        recorder.onerror = () => reject(new Error("hit-fx: recording failed"));
        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          const plain = type.split(";")[0];
          if (parts.length === 0) reject(new Error("hit-fx: empty clip"));
          else resolve(new File(parts, clipFileName(type), { type: plain }));
        };
        recorder.stop();
      }),
  };
}

export type ClipSave = "shared" | "downloaded" | "cancelled" | "needs-tap";

/**
 * Hands the clip over: the share sheet with the file (iPhone: Save Video, Instagram, TikTok), or a
 * plain download where files can't be shared. "needs-tap": the phone wants a fresh tap to open the
 * share sheet (the recording took too long to count as one), so the caller shows "Save clip".
 */
export async function saveClip(file: File): Promise<ClipSave> {
  const data = { files: [file] };
  if (typeof navigator.share === "function" && navigator.canShare?.(data)) {
    try {
      await navigator.share(data);
      return "shared";
    } catch (error) {
      const name = (error as { name?: string } | null)?.name;
      if (name === "AbortError") return "cancelled";
      if (name === "NotAllowedError") return "needs-tap";
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}

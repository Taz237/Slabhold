/**
 * Profile photos live here, under random paths that never change. Same
 * project as CARD_PHOTO_ORIGIN (lib/collection/grid.ts); kept here so Avatar,
 * which is in many chunks, doesn't pull in the collection grid.
 */
export const AVATAR_ORIGIN = "https://knuwflptobyutrauxblj.supabase.co";
export const AVATAR_PATH = "/storage/v1/object/public/avatars/";

/** Optimizer widths for avatars. Both are in next.config's image sizes. */
export const AVATAR_WIDTHS = [96, 256] as const;

/** Display size in CSS px from the avatar's Tailwind height class (h-10 is 40px). */
export function avatarPx(className: string): number {
  const match = /(?:^|\s)h-(\d+)(?:\s|$)/.exec(className);
  return match ? Number(match[1]) * 4 : 40;
}

function widthFor(px: number): number {
  return AVATAR_WIDTHS.find((width) => width >= px) ?? AVATAR_WIDTHS[AVATAR_WIDTHS.length - 1];
}

function optimized(url: string, width: number): string {
  return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=75`;
}

/**
 * A small, sized copy of a profile photo from the image optimizer (WebP or
 * AVIF), at 1x and 2x for the size it is drawn at. Other images (a local
 * preview, a photo from elsewhere) are left as they are.
 */
export function avatarImage(url: string, px: number): { src: string; srcSet?: string } {
  if (!url.startsWith(`${AVATAR_ORIGIN}${AVATAR_PATH}`) || url.includes("?")) return { src: url };
  const one = widthFor(px);
  const two = widthFor(px * 2);
  return {
    src: optimized(url, one),
    srcSet: one === two ? undefined : `${optimized(url, one)} 1x, ${optimized(url, two)} 2x`,
  };
}

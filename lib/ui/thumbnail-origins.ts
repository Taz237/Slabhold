import { rememberPhotoSize } from "@/lib/social/photo-sizes";

/**
 * The thumbnails inside `root`, in `data-photo-index` order, for the photo
 * viewer to grow out of and shrink back into. Also notes each loaded one's
 * size: a photo that loaded before hydration never ran its onLoad.
 */
export function thumbnailsIn(root: Element | null | undefined): HTMLImageElement[] {
  if (!root) return [];
  const imgs = [...root.querySelectorAll<HTMLImageElement>("img[data-photo-index]")].sort(
    (a, b) => Number(a.dataset.photoIndex) - Number(b.dataset.photoIndex),
  );
  for (const img of imgs) rememberPhotoSize(img.getAttribute("src") ?? "", img.naturalWidth, img.naturalHeight);
  return imgs;
}

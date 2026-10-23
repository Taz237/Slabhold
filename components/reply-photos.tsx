"use client";

import { useImageLightbox } from "@/components/image-lightbox";
import { PostPhotoGrid } from "@/components/post-photo-grid";

/** Same tap-to-view grid as a post. Plain img, not next/image. */
export function ReplyPhotos({ images }: { images?: readonly string[] | null }) {
  const open = useImageLightbox();
  if (!images?.length) return null;
  return <PostPhotoGrid images={images} onOpen={open} />;
}

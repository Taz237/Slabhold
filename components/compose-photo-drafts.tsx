"use client";

import { X } from "lucide-react";
import { postPhotoCellClass, postPhotoGridClass } from "@/lib/social/post-photos";

export function ComposePhotoDrafts({
  images,
  onRemove,
}: {
  images: readonly string[];
  onRemove: (index: number) => void;
}) {
  if (!images.length) return null;
  const several = images.length > 1;
  return (
    <div
      className={`relative mt-3 overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10 ${several ? postPhotoGridClass(images.length) : ""}`}
    >
      {images.map((src, index) => (
        <div key={`${index}-${src.slice(0, 48)}`} className={`relative ${postPhotoCellClass(images.length, index)}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            className={
              several
                ? "h-full w-full object-cover"
                : "max-h-72 w-full object-cover"
            }
          />
          <button
            type="button"
            onClick={() => onRemove(index)}
            aria-label={`Remove photo ${index + 1}`}
            className="absolute top-2 right-2 grid h-11 w-11 min-h-11 min-w-11 place-items-center rounded-full bg-black/70 text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useCallback, useRef, useState } from "react";
import { PHOTO_READ_ERROR, readPhotoFile } from "@/lib/photos";
import {
  MAX_POST_PHOTOS,
  appendPostPhotos,
  normalizePostPhotos,
  postPhotoLimitError,
} from "@/lib/social/post-photos";

/**
 * Read composer photos one batch at a time. A newer pick or Remove wins,
 * the same way Add card ignores a photo read that finished late.
 */
export function usePostPhotos(
  readFile: (file: File, maxSize?: number) => Promise<string> = readPhotoFile,
  initialPhoto: string | null = null,
) {
  const initial = initialPhoto ? normalizePostPhotos([initialPhoto]) : [];
  const photoReadId = useRef(0);
  const imagesRef = useRef<string[]>(initial);
  const limitRef = useRef(MAX_POST_PHOTOS);
  const [images, setImages] = useState<string[]>(initial);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [readingPhoto, setReadingPhoto] = useState(false);

  const setLimit = useCallback((limit: number) => {
    limitRef.current = limit;
    const photos = normalizePostPhotos(imagesRef.current, limit);
    if (photos.length !== imagesRef.current.length) {
      imagesRef.current = photos;
      setImages(photos);
    }
  }, []);

  const replaceAll = useCallback((next: readonly string[]) => {
    photoReadId.current += 1;
    setReadingPhoto(false);
    const photos = normalizePostPhotos(next, limitRef.current);
    imagesRef.current = photos;
    setImages(photos);
    setPhotoError(null);
  }, []);

  const removePhoto = useCallback((index: number) => {
    // A newer pick still wins. Removing one photo leaves the rest of this batch running.
    const photos = imagesRef.current.filter((_, item) => item !== index);
    imagesRef.current = photos;
    setImages(photos);
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    const list = files.filter((file) => Boolean(file));
    if (list.length === 0) return;
    const room = Math.max(0, limitRef.current - imagesRef.current.length);
    if (room <= 0) {
      setPhotoError(postPhotoLimitError(limitRef.current));
      return;
    }
    const batch = list.slice(0, room);
    const overflow = list.length - batch.length;
    const requestId = ++photoReadId.current;
    setPhotoError(null);
    setReadingPhoto(true);
    const read: string[] = [];
    let failure: string | null = null;
    try {
      for (const file of batch) {
        if (photoReadId.current !== requestId) return;
        try {
          read.push(await readFile(file, 960));
        } catch (error) {
          if (photoReadId.current !== requestId) return;
          failure = error instanceof Error ? error.message : PHOTO_READ_ERROR;
          break;
        }
      }
    } finally {
      if (photoReadId.current === requestId) setReadingPhoto(false);
    }
    if (photoReadId.current !== requestId) return;
    const appended = appendPostPhotos(imagesRef.current, read, limitRef.current);
    imagesRef.current = appended.photos;
    setImages(appended.photos);
    if (overflow > 0 || appended.rejected > 0) {
      setPhotoError(postPhotoLimitError(limitRef.current));
    } else if (failure) {
      setPhotoError(failure);
    } else {
      setPhotoError(null);
    }
  }, [readFile]);

  return {
    images,
    photoError,
    readingPhoto,
    addFiles,
    removePhoto,
    replaceAll,
    setLimit,
    setPhotoError,
  };
}

"use client";

import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { LightboxVideo } from "@/components/viewer-video";

export type LightboxOptions = {
  /** The thumbnails the photos open from, by gallery index: the open grows out of them and the close shrinks back. */
  origins?: readonly (HTMLElement | null | undefined)[];
  /** The post's actions along the bottom, like X. `close` starts the close animation. */
  footer?: (close: () => void) => React.ReactNode;
  /** Opens this video instead of a photo. `src` is its poster. */
  video?: LightboxVideo;
};

type OpenLightbox = (src: string, alt: string, gallery?: readonly string[], options?: LightboxOptions) => void;

export type ViewerState = {
  images: string[];
  index: number;
  alt: string;
  origins: readonly (HTMLElement | null | undefined)[];
  footer?: (close: () => void) => React.ReactNode;
  video?: LightboxVideo;
  key: number;
};

export const ImageLightboxContext = createContext<OpenLightbox>(() => {});

export function useImageLightbox() {
  return useContext(ImageLightboxContext);
}

/**
 * The viewer's code is its own chunk, so it adds nothing to a page's first
 * load. It's fetched once the page is idle, well before the first tap.
 */
const loadViewer = () => import("@/components/photo-viewer");
const PhotoViewer = lazy(loadViewer);

export function ImageLightboxProvider({ children }: { children: React.ReactNode }) {
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const keyRef = useRef(0);

  useEffect(() => {
    const warm = () => void loadViewer().catch(() => {});
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warm, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(warm, 2500);
    return () => window.clearTimeout(id);
  }, []);

  const open = useCallback<OpenLightbox>((src, alt, gallery, options) => {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;
    const images = !options?.video && gallery && gallery.length > 0 ? [...gallery] : [src];
    const found = images.indexOf(src);
    keyRef.current += 1;
    setViewer({
      images,
      index: found >= 0 ? found : 0,
      alt,
      origins: options?.origins ?? [],
      footer: options?.footer,
      video: options?.video,
      key: keyRef.current,
    });
  }, []);

  const closed = useCallback(() => {
    const opener = openerRef.current;
    openerRef.current = null;
    // Back to the photo that opened it, unless a footer action moved focus on (Reply).
    const active = document.activeElement;
    const stillOurs = !active || active === document.body || Boolean(active.closest?.("[data-photo-viewer-dialog]"));
    setViewer(null);
    if (stillOurs) opener?.focus({ preventScroll: true });
  }, []);

  return (
    <ImageLightboxContext.Provider value={open}>
      {children}
      {viewer ? (
        <Suspense fallback={null}>
          <PhotoViewer key={viewer.key} viewer={viewer} onClosed={closed} />
        </Suspense>
      ) : null}
    </ImageLightboxContext.Provider>
  );
}

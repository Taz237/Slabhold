"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

type LightboxImage = { images: string[]; index: number; alt: string };

const ImageLightboxContext = createContext<
  (src: string, alt: string, gallery?: readonly string[]) => void
>(() => {});

export function useImageLightbox() {
  return useContext(ImageLightboxContext);
}

function focusableIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("button, [href], input, select, textarea")].filter(
    (node) => !node.hasAttribute("disabled") && node.tabIndex !== -1,
  );
}

export function ImageLightboxProvider({ children }: { children: React.ReactNode }) {
  const [image, setImage] = useState<LightboxImage | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const open = useCallback((src: string, alt: string, gallery?: readonly string[]) => {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement ? active : null;
    const images = gallery && gallery.length > 0 ? [...gallery] : [src];
    const found = images.indexOf(src);
    setImage({ images, index: found >= 0 ? found : 0, alt });
  }, []);

  function close() {
    const opener = openerRef.current;
    openerRef.current = null;
    setImage(null);
    opener?.focus();
  }

  return (
    <ImageLightboxContext.Provider value={open}>
      {children}
      {image ? (
        <Lightbox
          image={image}
          onClose={close}
          onIndex={(index) => setImage((current) => (current ? { ...current, index } : current))}
        />
      ) : null}
    </ImageLightboxContext.Provider>
  );
}

export function LightboxNav({
  count,
  index,
  onPrev,
  onNext,
}: {
  count: number;
  index: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (count <= 1) return null;
  const buttonClass =
    "absolute top-1/2 z-10 grid h-11 w-11 min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-full bg-black/55 text-white disabled:opacity-40";
  return (
    <>
      <button
        type="button"
        aria-label="Previous photo"
        disabled={index <= 0}
        onClick={(event) => {
          event.stopPropagation();
          onPrev();
        }}
        className={`${buttonClass} left-3`}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        type="button"
        aria-label="Next photo"
        disabled={index >= count - 1}
        onClick={(event) => {
          event.stopPropagation();
          onNext();
        }}
        className={`${buttonClass} right-3`}
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </>
  );
}

function Lightbox({
  image,
  onClose,
  onIndex,
}: {
  image: LightboxImage;
  onClose: () => void;
  onIndex: (index: number) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef(image.index);
  const imagesRef = useRef(image.images);
  const onIndexRef = useRef(onIndex);
  const startY = useRef(0);
  const dragRef = useRef(0);
  const dragged = useRef(false);
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);
  const [dragY, setDragY] = useState(0);
  const [closing, setClosing] = useState(false);
  const timer = useRef(0);
  onCloseRef.current = onClose;

  useEffect(() => {
    indexRef.current = image.index;
    imagesRef.current = image.images;
    onIndexRef.current = onIndex;
  }, [image.index, image.images, onIndex]);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        finish();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        const index = indexRef.current;
        const last = imagesRef.current.length - 1;
        if (event.key === "ArrowLeft" && index > 0) onIndexRef.current(index - 1);
        if (event.key === "ArrowRight" && index < last) onIndexRef.current(index + 1);
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const items = focusableIn(root);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && root.contains(active);
      if (event.shiftKey) {
        if (!inside || active === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (!inside || active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    function onFocusIn(event: FocusEvent) {
      const root = dialogRef.current;
      if (closingRef.current || !root || root.contains(event.target as Node)) return;
      closeButtonRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocusIn);
      window.clearTimeout(timer.current);
    };
  }, []);

  function finish() {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    timer.current = window.setTimeout(() => onCloseRef.current(), 180);
  }

  function onTouchStart(event: React.TouchEvent) {
    if (event.touches.length !== 1) return;
    startY.current = event.touches[0].clientY;
    dragged.current = false;
  }

  function onTouchMove(event: React.TouchEvent) {
    const next = Math.max(0, event.touches[0].clientY - startY.current);
    if (next > 8) dragged.current = true;
    dragRef.current = next;
    setDragY(next);
  }

  function onTouchEnd() {
    const distance = dragRef.current;
    dragRef.current = 0;
    if (distance > 90) finish();
    else setDragY(0);
  }

  const dim = Math.max(0.35, 0.92 - dragY / 380);

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={image.alt}
      onClick={() => {
        if (dragged.current) {
          dragged.current = false;
          return;
        }
        finish();
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={`fixed inset-0 z-[80] ${closing ? "opacity-0" : "opacity-100"}`}
      style={{
        backgroundColor: `rgba(0, 0, 0, ${closing ? 0 : dim})`,
        transition: dragY > 0 && !closing ? "none" : "opacity 180ms ease, background-color 180ms ease",
        animation: closing ? undefined : "lightbox-fade 180ms ease",
      }}
    >
      <button
        ref={closeButtonRef}
        type="button"
        aria-label="Close"
        onClick={(event) => {
          event.stopPropagation();
          finish();
        }}
        className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-black/55 text-white"
      >
        <X className="h-5 w-5" />
      </button>
      <LightboxNav
        count={image.images.length}
        index={image.index}
        onPrev={() => onIndex(image.index - 1)}
        onNext={() => onIndex(image.index + 1)}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.images[image.index] ?? image.images[0]}
        alt={image.alt}
        onClick={(event) => event.stopPropagation()}
        draggable={false}
        className="absolute top-1/2 left-1/2 max-h-[100dvh] max-w-[100vw] object-contain select-none"
        style={{
          transform: `translate(-50%, calc(-50% + ${closing ? dragY + 24 : dragY}px))`,
          transition: dragY > 0 && !closing ? "none" : "transform 180ms ease",
        }}
      />
    </div>,
    document.body,
  );
}

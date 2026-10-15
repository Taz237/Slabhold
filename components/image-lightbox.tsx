"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type LightboxImage = { src: string; alt: string };

const ImageLightboxContext = createContext<(src: string, alt: string) => void>(() => {});

export function useImageLightbox() {
  return useContext(ImageLightboxContext);
}

export function ImageLightboxProvider({ children }: { children: React.ReactNode }) {
  const [image, setImage] = useState<LightboxImage | null>(null);
  const open = useCallback((src: string, alt: string) => {
    setImage({ src, alt });
  }, []);

  return (
    <ImageLightboxContext.Provider value={open}>
      {children}
      {image ? <Lightbox image={image} onClose={() => setImage(null)} /> : null}
    </ImageLightboxContext.Provider>
  );
}

function Lightbox({ image, onClose }: { image: LightboxImage; onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
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
    closeButtonRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") finish();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image.src}
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

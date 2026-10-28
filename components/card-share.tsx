"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Share, X } from "lucide-react";
import { CardVisibilitySwitch, type VisibilitySave } from "@/components/card-visibility";
import { useShareSheet, type ShareTarget } from "@/components/share-sheet";
import { cardTitle } from "@/lib/format";
import { cardShareState } from "@/lib/share/links";

type ShareCard = {
  id: string;
  playerName: string;
  year: number;
  yearLabel?: string;
  setBrand: string;
  isPublic?: boolean;
};

const buttonStyles = {
  icon: "inline-flex h-11 w-11 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-100",
  row: "inline-flex min-h-11 w-full max-w-sm items-center justify-center gap-2 rounded-full border border-zinc-300 px-5 text-sm font-semibold text-zinc-900 dark:border-white/20 dark:text-zinc-100",
};

/**
 * Share for the owner's own card. A private card never gets a link or an
 * image: tapping Share shows the public switch instead.
 */
export function CardShareButton({
  card,
  username,
  onTogglePublic,
  variant = "icon",
}: {
  card: ShareCard;
  username: string | null | undefined;
  onTogglePublic: (next: boolean) => VisibilitySave | void;
  variant?: "icon" | "row";
}) {
  const state = cardShareState({ isPublic: Boolean(card.isPublic), username, cardId: card.id });
  const name = `${cardTitle(card)} ${card.playerName}`.trim();
  const target: ShareTarget = {
    path: state.kind === "share" ? state.path : "/",
    title: name,
    text: `${name} on Slabhold`,
    imagePath: state.kind === "share" ? state.imagePath : undefined,
    source: "card",
  };
  const { share, sheet } = useShareSheet(target);
  const [privateOpen, setPrivateOpen] = useState(false);

  function onClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (state.kind === "share") void share();
    else if (state.kind === "private") setPrivateOpen(true);
  }

  return (
    <>
      <button
        type="button"
        aria-label="Share card"
        disabled={state.kind === "unavailable"}
        onClick={onClick}
        className={`${buttonStyles[variant]} disabled:opacity-50`}
      >
        <Share aria-hidden className="h-4 w-4" />
        {variant === "row" ? <span aria-hidden>Share</span> : null}
      </button>
      {state.kind === "share" ? sheet : null}
      {privateOpen ? (
        <PrivateShareSheet
          isPublic={Boolean(card.isPublic)}
          onTogglePublic={onTogglePublic}
          onShare={() => {
            setPrivateOpen(false);
            void share();
          }}
          onClose={() => setPrivateOpen(false)}
        />
      ) : null}
    </>
  );
}

function PrivateShareSheet({
  isPublic,
  onTogglePublic,
  onShare,
  onClose,
}: {
  isPublic: boolean;
  onTogglePublic: (next: boolean) => VisibilitySave | void;
  onShare: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCloseRef.current();
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[70] grid place-items-end bg-black/60 sm:place-items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-sm rounded-t-3xl border-t border-zinc-200 bg-[var(--background)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-zinc-900 shadow-2xl sm:rounded-3xl sm:border dark:border-white/10 dark:text-zinc-100"
      >
        <div aria-hidden className="mx-auto -mt-1 mb-2 h-1 w-9 rounded-full bg-zinc-300 sm:hidden dark:bg-white/20" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold tracking-tight">
              {isPublic ? "Ready to share" : "Make this card public to share"}
            </h2>
            <p className="mt-0.5 text-[13px] leading-5 text-zinc-500">
              {isPublic
                ? "It shows on your profile now, so the link works for anyone."
                : "Private cards stay off share links. Turn on Public to show it on your profile."}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-3">
          <CardVisibilitySwitch isPublic={isPublic} onChange={onTogglePublic} />
        </div>
        {isPublic ? (
          <button
            type="button"
            onClick={onShare}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-violet-600 px-5 text-[15px] font-semibold text-white hover:bg-violet-500"
          >
            <Share aria-hidden className="h-4 w-4" />
            Share
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

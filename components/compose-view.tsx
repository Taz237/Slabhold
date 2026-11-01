"use client";

import { goBackWithMotion } from "@/components/nav-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { Camera, Globe, ImagePlus, Layers, X } from "lucide-react";
import { AttachCardField } from "@/components/attach-card-field";
import { Avatar } from "@/components/avatar";
import { ComposePhotoDrafts } from "@/components/compose-photo-drafts";
import { PhotoFileInputs } from "@/components/photo-file-inputs";
import { usePostPhotos } from "@/components/use-post-photos";
import { useCollection } from "@/components/collection-provider";
import { QuoteComposePreview } from "@/components/quoted-post-embed";
import { MentionTextarea } from "@/components/mention-textarea";
import { signupPath } from "@/lib/auth/safe-next";
import { useSocial } from "@/components/social-provider";
import { takeCompose } from "@/lib/capture";
import {
  clearComposeDraft,
  composeDraftKey,
  keepComposeDraft,
  takeComposeDraft,
  type ComposeDraft,
} from "@/lib/social/compose-draft";
import { initials } from "@/lib/format";
import { PHOTO_HEIC_ERROR, readPhotoFile } from "@/lib/photos";
import {
  POST_PHOTO_LIMIT_ERROR,
  POST_PHOTO_SINGLE_ERROR,
  photoAttachFull,
  photoAttachHint,
  postPhotoLimit,
  postsSupportMultipleImages,
} from "@/lib/social/post-photos";
import { mapPublicCard, PUBLIC_CARD_SELECT } from "@/lib/social/cards";
import { toPublicAttachment } from "@/lib/social/card-posts";
import { QUOTE_EMPTY_ERROR, isQuoteSubmitDisabled, shouldConfirmDiscard, validateQuoteContent } from "@/lib/social/quotes";
import { POST_LIMIT, type PublicCard } from "@/lib/social/types";
import { loadSupabaseBrowser } from "@/lib/supabase/browser-lazy";
import { charRing } from "@/lib/ui/char-ring";
import { useVisualViewport } from "@/lib/ui/use-keyboard-inset";
import { isUuid } from "@/lib/value/card-value-access";

function readComposerPhoto(file: File) {
  return readPhotoFile(file, 960);
}

export function ComposeView() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const params = useSearchParams();
  const editId = params.get("edit");
  const attachCardParam = params.get("card");
  const quoteParam = params.get("quote");
  const { ready, user, posts, createPost, updatePost } = useSocial();
  const { cards, ready: cardsReady, syncError } = useCollection();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const photoSource = useRef<"camera" | "library">("library");
  const started = useRef(false);
  const [body, setBody] = useState("");
  const {
    images,
    photoError,
    limit,
    readingPhoto,
    addFiles,
    removePhoto,
    replaceAll,
    setLimit,
  } = usePostPhotos(readComposerPhoto);
  const photosFull = photoAttachFull(images.length, limit);
  const photoCapHint = photoAttachHint(limit);
  const [cardId, setCardId] = useState("");
  const [externalCard, setExternalCard] = useState<PublicCard | null>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { frame, inset } = useVisualViewport();
  const editing = posts.find((post) => post.id === editId && post.authorId === user?.id);
  const draftKey = composeDraftKey({ edit: editId, quote: quoteParam, card: attachCardParam });
  // What Back keeps: the latest draft, unless it was posted or discarded.
  const draftRef = useRef<{ key: string | null; draft: ComposeDraft; settled: boolean }>({
    key: draftKey,
    draft: { body: "", images: [], cardId: "", quoteId: null },
    settled: false,
  });
  const attachedIsOwned = Boolean(
    attachCardParam && cards.some((card) => card.id === attachCardParam),
  );

  useEffect(() => {
    if (!ready || !user || started.current) return;
    started.current = true;
    if (editId) {
      const post = posts.find((item) => item.id === editId && item.authorId === user.id);
      if (post) {
        setBody(post.body);
        replaceAll(post.images?.length ? post.images : post.imageDataUrl ? [post.imageDataUrl] : []);
        return;
      }
    }
    const kept = draftKey ? takeComposeDraft(draftKey) : null;
    if (kept) {
      setBody(kept.body);
      if (kept.cardId) setCardId(kept.cardId);
    }
    const captured = takeCompose();
    const restored = [...(kept?.images ?? []), ...(captured ? [captured] : [])];
    if (restored.length) replaceAll(restored);
  }, [draftKey, editId, posts, ready, replaceAll, user]);

  useEffect(() => {
    draftRef.current.key = draftKey;
    draftRef.current.draft = { body, images: [...images], cardId, quoteId };
  });

  // Back (the button, the iOS swipe, Android Back) can't wait for a prompt.
  // The draft waits in memory for the next composer in the same mode.
  useEffect(
    () => () => {
      const { key, draft, settled } = draftRef.current;
      if (key && !settled) keepComposeDraft(key, draft);
    },
    [],
  );

  function settleDraft() {
    draftRef.current.settled = true;
    clearComposeDraft();
  }

  useEffect(() => {
    if (!ready || !user || editId || !attachCardParam) return;
    if (attachedIsOwned) {
      setCardId(attachCardParam);
      setExternalCard(null);
      return;
    }
    if (!isUuid(attachCardParam)) return;
    let cancelled = false;
    void loadSupabaseBrowser().then((supabase) => {
      if (!supabase || cancelled) return;
      void supabase
        .from("public_cards")
        .select(PUBLIC_CARD_SELECT)
        .eq("id", attachCardParam)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled || !data) return;
          const mapped = toPublicAttachment(mapPublicCard(data));
          setExternalCard(mapped);
          setCardId(mapped.id);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [attachCardParam, attachedIsOwned, editId, ready, user]);

  useEffect(() => {
    if (!ready || !user || editId || !quoteParam) return;
    const original = posts.find((post) => post.id === quoteParam);
    if (!original) {
      setQuoteId(null);
      setError("That post is unavailable.");
      return;
    }
    setQuoteId(quoteParam);
    setError(null);
  }, [editId, posts, quoteParam, ready, user]);

  useEffect(() => {
    if (ready && !user) {
      const search = params.toString();
      router.replace(signupPath(search ? `${pathname}?${search}` : pathname));
    }
  }, [pathname, params, ready, router, user]);

  useEffect(() => {
    let cancelled = false;
    void loadSupabaseBrowser().then((supabase) => {
      if (!supabase || cancelled) return;
      void postsSupportMultipleImages(supabase).then((ok) => {
        if (!cancelled) setLimit(postPhotoLimit(ok));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [setLimit]);

  function openCamera() {
    if (photoAttachFull(images.length, limit)) return;
    photoSource.current = "camera";
    cameraRef.current?.click();
  }

  function openLibrary() {
    if (photoAttachFull(images.length, limit)) return;
    photoSource.current = "library";
    libraryRef.current?.click();
  }

  function retryPhoto() {
    if (photoSource.current === "camera") openCamera();
    else openLibrary();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const selected = cards.find((card) => card.id === cardId);
    const source =
      selected ?? (externalCard?.id === cardId ? externalCard : null);
    const card: PublicCard | null = source ? toPublicAttachment(source) : null;
    const image = images[0] ?? null;

    if (quoteId) {
      const quoteError = validateQuoteContent({
        body,
        imageDataUrl: image,
        card,
      });
      if (quoteError) {
        setError(quoteError);
        return;
      }
      if (!posts.some((post) => post.id === quoteId)) {
        setError("That post is unavailable.");
        return;
      }
    } else if (!body.trim() && images.length === 0 && !card) {
      setError("Write something, add a photo, or attach a card.");
      return;
    }

    setSending(true);
    const result = editing
      ? await updatePost(editing.id, { body, imageDataUrl: image, images })
      : await createPost({
          body,
          imageDataUrl: image,
          images,
          card,
          quotedPostId: quoteId,
        });
    setSending(false);
    if (result.error) {
      setError(result.error === QUOTE_EMPTY_ERROR ? QUOTE_EMPTY_ERROR : result.error);
      return;
    }
    settleDraft();
    router.push(editing ? `/posts/${editing.id}` : "/");
  }

  const loading = !ready || !user;

  // Keep the line being typed above the toolbar. The textarea grows, so the body scrolls.
  useLayoutEffect(() => {
    const field = textRef.current;
    const scroller = scrollRef.current;
    if (!field || !scroller || document.activeElement !== field) return;
    if (field.selectionEnd !== field.value.length) return;
    const hidden = field.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom + 12;
    if (hidden > 0) scroller.scrollTop += hidden;
  }, [body, frame?.height]);

  const ownedAttachment = cards.find((card) => card.id === cardId);
  const attachedPreview = editing
    ? null
    : ownedAttachment
      ? toPublicAttachment(ownedAttachment)
      : externalCard?.id === cardId
        ? externalCard
        : null;

  const canPost = quoteId
    ? !isQuoteSubmitDisabled({
        body,
        imageDataUrl: images[0] ?? null,
        card: attachedPreview,
      }) && !sending && !readingPhoto
    : (body.trim().length > 0 || images.length > 0 || Boolean(cardId)) && !sending && !readingPhoto;

  function leave() {
    leaveCompose(router);
  }

  function discard() {
    settleDraft();
    leave();
  }

  function onCancel() {
    if (
      shouldConfirmDiscard({
        body,
        imageDataUrl: images[0] ?? null,
        hasCard: Boolean(attachedPreview),
      })
    ) {
      setConfirmDiscard(true);
      return;
    }
    leave();
  }

  const showCardButton = !editing && !externalCard;
  const cardsUsable = cardsReady && !syncError;

  return (
    <ComposeSheet
      frame={frame}
      label={editing ? "Edit post" : quoteId ? "Quote post" : "New post"}
      onDismiss={loading ? leave : onCancel}
      initialFocus={textRef}
      overlay={
        confirmDiscard ? (
          <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:items-center md:pb-3">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="discard-post-title"
              className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl motion-safe:animate-[composer-in_200ms_cubic-bezier(0.2,0.7,0.2,1)_backwards] dark:bg-zinc-900"
            >
              <h2 id="discard-post-title" className="text-lg font-bold tracking-tight">
                Discard post?
              </h2>
              <p className="mt-1 text-sm text-zinc-500">Your text, photos and card go with it.</p>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={discard}
                  className="min-h-11 rounded-full bg-rose-600 text-[15px] font-bold text-white active:bg-rose-700"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDiscard(false)}
                  className="min-h-11 rounded-full border border-zinc-300 text-[15px] font-semibold active:bg-zinc-100 dark:border-white/15 dark:active:bg-white/5"
                >
                  Keep editing
                </button>
              </div>
            </div>
          </div>
        ) : null
      }
    >
      {loading ? (
        <>
          <ComposeTopRow onCancel={leave}>
            <button type="button" disabled className={POST_PILL}>
              Post
            </button>
          </ComposeTopRow>
          <ComposeSkeletonBody />
        </>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="flex min-h-0 flex-1 flex-col">
          <ComposeTopRow onCancel={onCancel}>
            <button type="submit" disabled={!canPost} className={POST_PILL}>
              {sending
                ? editing
                  ? "Saving…"
                  : "Posting…"
                : editing
                  ? "Save"
                  : quoteId
                    ? "Quote"
                    : "Post"}
            </button>
          </ComposeTopRow>

          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-6">
            <div className="flex gap-3">
              <Avatar
                name={user.displayName}
                image={user.avatarDataUrl}
                accent={user.accent}
                className="h-10 w-10 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <MentionTextarea
                  ref={textRef}
                  value={body}
                  onChange={setBody}
                  maxLength={POST_LIMIT}
                  rows={1}
                  autoGrow
                  autoFocus
                  menu="inline"
                  placeholder={quoteId ? "Add a comment" : "What's happening?"}
                  className="block w-full resize-none overflow-hidden bg-transparent pt-2 text-[17px] leading-6 caret-[#7C3AED] outline-none placeholder:text-zinc-500"
                />
                {error ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
                {photoError ? (
                  <div role="alert" className="mt-3 space-y-2">
                    <p className="text-sm text-rose-600 dark:text-rose-400">{photoError}</p>
                    {photoError === PHOTO_HEIC_ERROR ||
                    photoError === POST_PHOTO_LIMIT_ERROR ||
                    photoError === POST_PHOTO_SINGLE_ERROR ? null : (
                      <button
                        type="button"
                        onClick={retryPhoto}
                        className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-violet-700 dark:text-violet-300"
                      >
                        Try again
                      </button>
                    )}
                  </div>
                ) : null}
                <ComposePhotoDrafts images={images} onRemove={removePhoto} />
                {readingPhoto ? <p className="mt-2 text-sm text-zinc-500">Reading photo…</p> : null}
                {quoteId ? (
                  <div className="mt-3 w-full">
                    <QuoteComposePreview
                      quotedPostId={quoteId}
                      onRemove={() => {
                        setQuoteId(null);
                        router.replace("/compose", { scroll: false });
                      }}
                    />
                  </div>
                ) : null}
                {attachedPreview ? (
                  <ComposeCardPreview
                    card={attachedPreview}
                    onRemove={() => {
                      setCardId("");
                      setExternalCard(null);
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>

          {!editing ? (
            <p className="flex shrink-0 items-center gap-1.5 px-4 pb-2 text-[13px] font-semibold text-[#7C3AED] dark:text-[#A78BFA]">
              <Globe aria-hidden className="h-4 w-4" />
              Everyone can reply
            </p>
          ) : null}

          <div
            className={`relative shrink-0 border-t border-zinc-200 dark:border-white/10 ${
              inset > 0 ? "" : "pb-[env(safe-area-inset-bottom)]"
            }`}
          >
            {pickerOpen && showCardButton && cardsReady && !syncError ? (
              <div
                id="compose-card-picker"
                className="absolute inset-x-2 bottom-full mb-2 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl motion-safe:animate-[composer-in_180ms_cubic-bezier(0.2,0.7,0.2,1)_backwards] dark:border-white/10 dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between py-1 pr-1 pl-4">
                  <p className="text-[13px] font-semibold text-zinc-500">Attach a card</p>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(false)}
                    aria-label="Close card list"
                    className="grid h-11 w-11 place-items-center rounded-full text-zinc-500 active:bg-zinc-100 dark:active:bg-white/5"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto overscroll-contain pb-1">
                  <AttachCardField
                    variant="list"
                    cards={cards}
                    value={cardId}
                    onChange={(id) => {
                      setCardId(id);
                      setPickerOpen(false);
                    }}
                  />
                </div>
              </div>
            ) : null}
            {photosFull ? (
              <div className="px-3 pt-1.5">
                <span id="compose-photo-cap" className="block px-1 pb-1 text-xs text-zinc-500">
                  {photoCapHint}
                </span>
              </div>
            ) : null}
            <div className="flex h-11 items-center px-1.5">
              <PhotoFileInputs
                cameraRef={cameraRef}
                libraryRef={libraryRef}
                libraryMultiple
                onPick={(file) => {
                  if (file) void addFiles([file]);
                }}
                onPickMany={(files) => void addFiles(files)}
              />
              <button
                type="button"
                aria-label="Camera"
                disabled={photosFull}
                aria-describedby={photosFull ? "compose-photo-cap" : undefined}
                onClick={openCamera}
                className={TOOL_BUTTON}
              >
                <Camera className="h-[22px] w-[22px]" />
              </button>
              <button
                type="button"
                aria-label="Photo library"
                disabled={photosFull}
                aria-describedby={photosFull ? "compose-photo-cap" : undefined}
                onClick={openLibrary}
                className={TOOL_BUTTON}
              >
                <ImagePlus className="h-[22px] w-[22px]" />
              </button>
              {showCardButton ? (
                <button
                  type="button"
                  aria-label="Attach a card"
                  aria-expanded={pickerOpen && cardsUsable}
                  aria-controls={pickerOpen && cardsUsable ? "compose-card-picker" : undefined}
                  disabled={!cardsUsable}
                  onClick={() => setPickerOpen((open) => !open)}
                  className={TOOL_BUTTON}
                >
                  <Layers className="h-[22px] w-[22px]" />
                </button>
              ) : null}
              <div className="ml-auto flex items-center pr-2.5">
                <CharacterRing length={body.length} />
                <span className="sr-only" aria-live="polite">
                  {body.length}/{POST_LIMIT}
                </span>
              </div>
            </div>
          </div>
        </form>
      )}
    </ComposeSheet>
  );
}

const POST_PILL =
  "hit-44 h-8 rounded-full bg-[#7C3AED] px-4 text-[15px] font-bold text-white transition-colors active:bg-[#5B21B6] disabled:opacity-50";

const TOOL_BUTTON =
  "grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#7C3AED] transition-colors active:bg-violet-500/10 disabled:opacity-40 dark:text-[#A78BFA]";

type NavRouter = ReturnType<typeof useRouter>;

function leaveCompose(router: NavRouter) {
  if (typeof window !== "undefined" && window.history.length > 1) {
    goBackWithMotion(() => router.back());
    return;
  }
  router.push("/");
}

const subscribeNothing = () => () => {};

/** True after hydration, so the portal never renders on the server. */
function useMounted() {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

/**
 * The composer as a full-screen sheet on phones and a centred modal from md.
 * Portaled to <body> so no transformed ancestor (the page's view transition,
 * the swipe-back) can trap it. It is sized to the visual viewport, so its last
 * child, the toolbar, rests on the keyboard. The entrance animation fills
 * backwards only: once it ends nothing above the toolbar is transformed.
 */
function ComposeSheet({
  frame,
  label,
  onDismiss,
  initialFocus,
  overlay,
  children,
}: {
  frame: { top: number; height: number } | null;
  label: string;
  onDismiss: () => void;
  initialFocus: React.RefObject<HTMLTextAreaElement | null>;
  overlay: React.ReactNode;
  children: React.ReactNode;
}) {
  const mounted = useMounted();
  const dismiss = useEffectEvent(onDismiss);

  useEffect(() => {
    const html = document.documentElement;
    const page = document.body;
    const before = [html.style.overflow, page.style.overflow] as const;
    html.style.overflow = "hidden";
    page.style.overflow = "hidden";
    return () => {
      html.style.overflow = before[0];
      page.style.overflow = before[1];
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) dismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (mounted) initialFocus.current?.focus({ preventScroll: true });
  }, [initialFocus, mounted]);

  // Closing by Back unmounts the sheet with the field focused. Let go of it
  // while it is still in the page, so the keyboard closes and the page
  // underneath isn't left offset.
  useLayoutEffect(
    () => () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest("[data-compose-sheet]")) active.blur();
    },
    [],
  );

  if (!mounted) return null;
  return createPortal(
    <div
      data-compose-sheet=""
      className="fixed inset-x-0 top-0 z-[60] h-dvh md:flex md:items-center md:justify-center md:bg-black/50 md:p-6"
      style={frame ? { top: frame.top, height: frame.height } : undefined}
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative flex h-full w-full flex-col bg-white text-zinc-900 motion-safe:animate-[composer-in_220ms_cubic-bezier(0.2,0.7,0.2,1)_backwards] md:h-auto md:max-h-full md:min-h-[22rem] md:max-w-lg md:rounded-2xl md:shadow-2xl dark:bg-[#09090B] dark:text-zinc-100 md:dark:ring-1 md:dark:ring-white/10"
      >
        {children}
      </div>
      {overlay}
    </div>,
    document.body,
  );
}

function ComposeTopRow({ onCancel, children }: { onCancel: () => void; children: React.ReactNode }) {
  return (
    <div className="box-content flex h-11 shrink-0 items-center justify-between pt-[env(safe-area-inset-top)] pr-4 pl-2 md:h-14 md:pt-0">
      <button
        type="button"
        onClick={onCancel}
        className="min-h-11 rounded-full px-2 text-[15px] text-zinc-700 active:opacity-60 dark:text-zinc-300"
      >
        Cancel
      </button>
      {children}
    </div>
  );
}

function ComposeSkeletonBody() {
  return (
    <div aria-hidden className="flex gap-3 px-4 pt-3">
      <div className="skeleton-shimmer h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2.5 pt-3">
        <div className="skeleton-shimmer h-3.5 w-3/4 rounded-full" />
        <div className="skeleton-shimmer h-3.5 w-1/2 rounded-full" />
      </div>
    </div>
  );
}

/** Before the search params resolve: the sheet's frame, drawn in place, no header or tabs. */
export function ComposeFallback() {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white md:hidden dark:bg-[#09090B]">
      <div className="box-content flex h-11 shrink-0 items-center justify-between pt-[env(safe-area-inset-top)] pr-4 pl-4">
        <span className="text-[15px] text-zinc-700 dark:text-zinc-300">Cancel</span>
        <span className="flex h-8 items-center rounded-full bg-[#7C3AED] px-4 text-[15px] font-bold text-white opacity-50">
          Post
        </span>
      </div>
      <ComposeSkeletonBody />
    </div>
  );
}

function CharacterRing({ length }: { length: number }) {
  const ring = charRing(length, POST_LIMIT);
  if (!ring.visible) return null;
  const size = ring.label ? 28 : 20;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const around = 2 * Math.PI * radius;
  const tone =
    ring.tone === "over"
      ? "stroke-rose-500"
      : ring.tone === "warn"
        ? "stroke-amber-500"
        : "stroke-[#7C3AED] dark:stroke-[#A78BFA]";
  return (
    <span
      aria-hidden
      data-tone={ring.tone}
      className="relative grid place-items-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            className="stroke-zinc-200 dark:stroke-zinc-700"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={around}
            strokeDashoffset={around * (1 - ring.progress)}
            className={tone}
          />
        </g>
      </svg>
      {ring.label ? (
        <span
          className={`absolute text-[11px] font-medium tabular-nums ${
            ring.tone === "over" ? "text-rose-500" : "text-amber-500"
          }`}
        >
          {ring.label}
        </span>
      ) : null}
    </span>
  );
}

function ComposeCardPreview({
  card,
  onRemove,
}: {
  card: PublicCard;
  onRemove: () => void;
}) {
  const grade = card.grade?.trim();
  return (
    <div className="relative mt-3 overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10">
      {card.photoDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.photoDataUrl} alt="" className="max-h-80 w-full object-cover" />
      ) : (
        <div
          className="grid h-36 place-items-center text-lg font-semibold text-white"
          style={{ background: `linear-gradient(160deg, ${card.accent}, #18181b)` }}
        >
          {initials(card.playerName)}
        </div>
      )}
      <div className="px-3 py-2 pr-12">
        <p className="truncate text-sm font-semibold">{card.playerName}</p>
        <p className="truncate text-xs text-zinc-500">
          {card.year} {card.setBrand}
          {card.cardNumber ? ` · #${card.cardNumber}` : ""}
          {grade ? ` · ${grade}` : ""}
        </p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove card"
        className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

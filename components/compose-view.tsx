"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useCollection } from "@/components/collection-provider";
import { QuoteComposePreview } from "@/components/quoted-post-embed";
import { MentionTextarea } from "@/components/mention-textarea";
import { LoadingRows } from "@/components/status";
import { signupPath } from "@/lib/auth/safe-next";
import { useSocial } from "@/components/social-provider";
import { takeCompose } from "@/lib/capture";
import { initials } from "@/lib/format";
import { fileToDataUrl } from "@/lib/storage";
import { mapPublicCard, PUBLIC_CARD_SELECT } from "@/lib/social/cards";
import { toPublicAttachment } from "@/lib/social/card-posts";
import { QUOTE_EMPTY_ERROR, isQuoteSubmitDisabled, shouldConfirmDiscard, validateQuoteContent } from "@/lib/social/quotes";
import { POST_LIMIT, type PublicCard } from "@/lib/social/types";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { isUuid } from "@/lib/value/card-value-access";

export function ComposeView() {
  const router = useRouter();
  const pathname = usePathname() || "/";
  const params = useSearchParams();
  const editId = params.get("edit");
  const attachCardParam = params.get("card");
  const quoteParam = params.get("quote");
  const { ready, user, posts, createPost, updatePost } = useSocial();
  const { cards } = useCollection();
  const fileRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const [body, setBody] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [cardId, setCardId] = useState("");
  const [externalCard, setExternalCard] = useState<PublicCard | null>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const editing = posts.find((post) => post.id === editId && post.authorId === user?.id);
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
        setImage(post.imageDataUrl);
        return;
      }
    }
    const captured = takeCompose();
    if (captured) setImage(captured);
  }, [editId, posts, ready, user]);

  useEffect(() => {
    if (!ready || !user || editId || !attachCardParam) return;
    if (attachedIsOwned) {
      setCardId(attachCardParam);
      setExternalCard(null);
      return;
    }
    if (!isUuid(attachCardParam)) return;
    let cancelled = false;
    const supabase = createSupabaseBrowser();
    if (!supabase) return;
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

  async function onImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    try {
      setImage(await fileToDataUrl(file, 960));
      setError(null);
    } catch {
      setError("Could not read that image.");
    }
  }

  function openPicker(capture: boolean) {
    const input = fileRef.current;
    if (!input) return;
    if (capture) input.setAttribute("capture", "environment");
    else input.removeAttribute("capture");
    input.click();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const selected = cards.find((card) => card.id === cardId);
    const source =
      selected ?? (externalCard?.id === cardId ? externalCard : null);
    const card: PublicCard | null = source ? toPublicAttachment(source) : null;

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
    } else if (!body.trim() && !image && !card) {
      setError("Write something, add a photo, or attach a card.");
      return;
    }

    setSending(true);
    const result = editing
      ? await updatePost(editing.id, { body, imageDataUrl: image })
      : await createPost({
          body,
          imageDataUrl: image,
          card,
          quotedPostId: quoteId,
        });
    setSending(false);
    if (result.error) {
      setError(result.error === QUOTE_EMPTY_ERROR ? QUOTE_EMPTY_ERROR : result.error);
      return;
    }
    router.push(editing ? `/posts/${editing.id}` : "/");
  }

  if (!ready || !user) {
    return (
      <div className="-mx-4 -mt-5">
        <LoadingRows count={2} />
      </div>
    );
  }

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
        imageDataUrl: image,
        card: attachedPreview,
      }) && !sending
    : (body.trim().length > 0 || Boolean(image) || Boolean(cardId)) && !sending;

  function leave() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  function onCancel() {
    if (
      shouldConfirmDiscard({
        body,
        imageDataUrl: image,
        hasCard: Boolean(attachedPreview),
      })
    ) {
      setConfirmDiscard(true);
      return;
    }
    leave();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="-mx-4 -mt-5 flex flex-col pb-16">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5 dark:border-white/10">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-2 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canPost}
          className="rounded-full bg-violet-600 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
        >
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
      </div>

      <div className="px-4 py-4">
        <div className="relative z-20 flex gap-3">
          <Avatar
            name={user.displayName}
            image={user.avatarDataUrl}
            accent={user.accent}
            className="h-10 w-10"
          />
          <div className="min-w-0 flex-1">
            <MentionTextarea
              value={body}
              onChange={setBody}
              maxLength={POST_LIMIT}
              rows={6}
              autoFocus
              menu="inline"
              placeholder={quoteId ? "Add a comment" : "What's happening?"}
              className="w-full resize-none bg-transparent text-[17px] leading-6 outline-none placeholder:text-zinc-500"
            />
            {error ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
          </div>
        </div>
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
        {image ? (
          <div className="relative mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt=""
              className="max-h-72 w-full rounded-2xl border border-zinc-200 object-cover dark:border-white/10"
            />
            <button
              type="button"
              onClick={() => setImage(null)}
              aria-label="Remove photo"
              className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white"
            >
              <X className="h-4 w-4" />
            </button>
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

      <div className="fixed inset-x-0 bottom-[calc(6.15rem+env(safe-area-inset-bottom))] z-20 mx-auto flex w-full min-w-0 max-w-lg items-center gap-1 overflow-hidden border-t border-zinc-200 bg-[var(--background)] px-2 py-2 dark:border-white/10">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void onImage(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => openPicker(true)}
          className="inline-flex min-w-0 shrink items-center gap-1.5 rounded-full px-2 py-2 text-sm font-medium text-violet-700 dark:text-violet-300"
        >
          <Camera className="h-5 w-5 shrink-0" />
          <span className="truncate">Camera</span>
        </button>
        <button
          type="button"
          onClick={() => openPicker(false)}
          className="inline-flex min-w-0 shrink items-center gap-1.5 rounded-full px-2 py-2 text-sm font-medium text-violet-700 dark:text-violet-300"
        >
          <ImagePlus className="h-5 w-5 shrink-0" />
          <span className="truncate">Library</span>
        </button>
        {!editing && externalCard ? null : !editing ? (
          <select
            value={cardId}
            onChange={(e) => setCardId(e.target.value)}
            aria-label="Attach a card"
            className="min-w-0 flex-1 truncate rounded-full border border-zinc-200 bg-transparent px-2 py-1.5 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-300"
          >
            <option value="">Attach a card</option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.year} {card.playerName}
              </option>
            ))}
          </select>
        ) : null}
        <span
          className={`ml-auto shrink-0 pr-1 text-xs whitespace-nowrap tabular-nums ${
            body.length > POST_LIMIT - 20 ? "text-rose-500" : "text-zinc-400"
          }`}
        >
          {body.length}/{POST_LIMIT}
        </span>
      </div>
      {confirmDiscard ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="discard-post-title"
            className="w-full max-w-sm rounded-2xl bg-white p-5 dark:bg-zinc-950"
          >
            <h2 id="discard-post-title" className="text-lg font-bold">
              Discard post?
            </h2>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDiscard(false)}
                className="rounded-full px-3 py-1.5 text-sm font-semibold"
              >
                Keep editing
              </button>
              <button
                type="button"
                onClick={leave}
                className="rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-bold text-white dark:bg-zinc-100 dark:text-zinc-950"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </form>
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

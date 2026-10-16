"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { useCollection } from "@/components/collection-provider";
import { MentionTextarea } from "@/components/mention-textarea";
import { LoadingRows } from "@/components/status";
import { useSocial } from "@/components/social-provider";
import { takeCompose } from "@/lib/capture";
import { fileToDataUrl } from "@/lib/storage";
import { POST_LIMIT, type PublicCard } from "@/lib/social/types";

export function ComposeView() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("edit");
  const attachCardParam = params.get("card");
  const { ready, user, posts, createPost, updatePost } = useSocial();
  const { cards } = useCollection();
  const fileRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const [body, setBody] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [cardId, setCardId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const editing = posts.find((post) => post.id === editId && post.authorId === user?.id);

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
    if (!ready || !user || editId) return;
    if (!attachCardParam) return;
    if (cards.some((card) => card.id === attachCardParam)) {
      setCardId(attachCardParam);
    }
  }, [attachCardParam, cards, editId, ready, user]);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, router, user]);

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
    const card: PublicCard | null = selected
      ? {
          id: selected.id,
          playerName: selected.playerName,
          year: selected.year,
          setBrand: selected.setBrand,
          cardNumber: selected.cardNumber,
          sport: selected.sport,
          photoDataUrl: selected.photoDataUrl,
          accent: selected.accent,
          estimatedSellPrice: selected.estimatedSellPrice,
        }
      : null;
    if (!body.trim() && !image && !card) {
      setError("Write something, add a photo, or attach a card.");
      return;
    }
    setSending(true);
    const result = editing
      ? await updatePost(editing.id, { body, imageDataUrl: image })
      : await createPost({ body, imageDataUrl: image, card });
    setSending(false);
    if (result.error) {
      setError(result.error);
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

  const canPost =
    (body.trim().length > 0 || Boolean(image) || Boolean(cardId)) && !sending;

  return (
    <form onSubmit={(e) => void submit(e)} className="-mx-4 -mt-5 flex flex-col pb-16">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5 dark:border-white/10">
        <button
          type="button"
          onClick={() => router.push("/")}
          className="rounded-full px-2 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canPost}
          className="rounded-full bg-violet-600 px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
        >
          {sending ? (editing ? "Saving…" : "Posting…") : editing ? "Save" : "Post"}
        </button>
      </div>

      <div className="flex flex-1 gap-3 px-4 py-4">
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
            menu="docked"
            placeholder="What's happening?"
            className="w-full resize-none bg-transparent text-[17px] leading-6 outline-none placeholder:text-zinc-500"
          />
          {image ? (
            <div className="relative mt-2">
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
          {error ? <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(6.15rem+env(safe-area-inset-bottom))] z-20 mx-auto flex w-full max-w-lg items-center gap-1 border-t border-zinc-200 bg-[var(--background)] px-3 py-2 dark:border-white/10">
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
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-violet-700 dark:text-violet-300"
        >
          <Camera className="h-5 w-5" />
          Camera
        </button>
        <button
          type="button"
          onClick={() => openPicker(false)}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-violet-700 dark:text-violet-300"
        >
          <ImagePlus className="h-5 w-5" />
          Library
        </button>
        {!editing ? (
          <select
            value={cardId}
            onChange={(e) => setCardId(e.target.value)}
            aria-label="Attach a card"
            className="max-w-[140px] truncate rounded-full border border-zinc-200 bg-transparent px-2 py-1.5 text-xs text-zinc-600 dark:border-white/10 dark:text-zinc-300"
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
          className={`ml-auto pr-2 text-xs tabular-nums ${
            body.length > POST_LIMIT - 20 ? "text-rose-500" : "text-zinc-400"
          }`}
        >
          {body.length}/{POST_LIMIT}
        </span>
      </div>
    </form>
  );
}

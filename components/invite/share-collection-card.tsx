"use client";

import { useRef, useState } from "react";
import { Download, Share } from "lucide-react";
import { absoluteUrl } from "@/components/share-button";
import { useShareSheet } from "@/components/share-sheet";
import { useCollection } from "@/components/collection-provider";
import { useSocial } from "@/components/social-provider";
import { trackEvent } from "@/lib/analytics";
import {
  collectionSharePath,
  collectionShareText,
  collectionStoryFilename,
  collectionStoryPath,
  withShareRef,
  xIntentUrl,
} from "@/lib/share/links";
import { shareImage } from "@/lib/share/share-image";

function XLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M17.75 3h3.07l-6.71 7.67L22 21h-6.18l-4.84-6.33L5.44 21H2.37l7.18-8.2L2 3h6.33l4.38 5.79L17.75 3Zm-1.08 16.2h1.7L7.4 4.72H5.58l11.09 14.48Z" />
    </svg>
  );
}

const action =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full text-14 font-semibold whitespace-nowrap transition-transform duration-150 active:scale-[0.97] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:outline-none";

/** The preview a link to your collection unfurls into. A designed block until it loads, never a broken image. */
function PreviewThumb({ src }: { src: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "failed">("loading");
  return (
    <div className="relative aspect-[1200/630] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-[#09090B] dark:border-white/10">
      {state !== "loaded" ? (
        <div aria-hidden className={`absolute inset-0 ${state === "loading" ? "skeleton-shimmer" : "bg-gradient-to-br from-[#7C3AED]/40 to-[#09090B]"}`} />
      ) : null}
      {state !== "failed" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt="Preview of your collection link"
          width={1200}
          height={630}
          loading="lazy"
          decoding="async"
          onLoad={() => setState("loaded")}
          onError={() => setState("failed")}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 motion-reduce:transition-none ${state === "loaded" ? "opacity-100" : "opacity-0"}`}
        />
      ) : null}
    </div>
  );
}

/**
 * "Share my collection", on your own profile and at the top of /collection:
 * the link preview, then Share, Post on X and Save for Stories (1080×1920).
 */
export function ShareCollectionCard() {
  const { user } = useSocial();
  const { cards } = useCollection();
  const [saving, setSaving] = useState(false);
  const story = useRef<Promise<Blob | null> | null>(null);
  const username = user?.username ?? "";
  const publicCount = cards.filter((card) => card.isPublic).length;
  const path = collectionSharePath(username);
  const text = collectionShareText(publicCount);
  const { share, sheet } = useShareSheet({ path, title: "Share my collection", text, source: "collection" });

  if (!user) return null;

  /** Fetch the Story image on intent, so the tap can still open the share sheet on iPhone. */
  function warmStory() {
    story.current ??= fetch(collectionStoryPath(username))
      .then((response) => (response.ok ? response.blob() : null))
      .catch(() => null);
    return story.current;
  }

  async function saveStory() {
    const src = collectionStoryPath(username);
    const name = collectionStoryFilename(username);
    setSaving(true);
    try {
      const blob = await warmStory();
      if (!blob) {
        story.current = null;
        window.open(src, "_blank", "noopener");
        return;
      }
      await shareImage({ blob, filename: name, title: "My collection on Slabhold", src, source: "collection" });
    } finally {
      setSaving(false);
    }
  }

  const xHref = typeof window === "undefined" ? "#" : xIntentUrl({ text, url: withShareRef(absoluteUrl(path)) });

  return (
    <section
      data-share-collection=""
      aria-labelledby="share-collection-title"
      className="overflow-hidden rounded-3xl border border-violet-500/20 bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.05),0_8px_24px_rgba(0,0,0,0.06)] dark:border-violet-400/15 dark:bg-white/[0.03] dark:shadow-none"
    >
      <div className="flex items-baseline justify-between gap-3 px-1 pt-0.5 pb-2.5 big:flex-wrap">
        <h2 id="share-collection-title" className="text-16 font-semibold tracking-tight">
          Share my collection
        </h2>
        <span className="text-13 font-medium text-zinc-500">
          {publicCount} public {publicCount === 1 ? "card" : "cards"}
        </span>
      </div>
      <PreviewThumb src={`${path}/opengraph-image`} />
      <div className="mt-3 flex gap-2 big:flex-wrap">
        <button type="button" onClick={() => void share()} className={`${action} bg-violet-600 px-5 text-white`}>
          <Share aria-hidden className="h-4 w-4" />
          Share
        </button>
        <a
          href={xHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share to X"
          onClick={() => trackEvent("share", { source: "collection", method: "x" })}
          className={`${action} w-11 shrink-0 bg-zinc-950 text-white dark:bg-white dark:text-zinc-950`}
        >
          <XLogo className="h-4 w-4" />
        </a>
        <button
          type="button"
          disabled={saving}
          onPointerDown={() => void warmStory()}
          onClick={() => void saveStory()}
          className={`${action} min-w-0 flex-1 border px-3 border-zinc-300 disabled:opacity-60 big:w-full big:flex-none big:whitespace-normal dark:border-white/15`}
        >
          <Download aria-hidden className="h-4 w-4" />
          {saving ? "Saving…" : "Save for Stories"}
        </button>
      </div>
      {publicCount === 0 ? (
        <p className="mt-2.5 px-1 text-13 text-zinc-500">Make a card public and it shows up on your shared collection.</p>
      ) : null}
      {sheet}
    </section>
  );
}

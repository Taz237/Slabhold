"use client";

import { useEffect, useRef, useState } from "react";
import type { PhotoStatus } from "@/lib/collection/grid";
import { Heart, MessageCircle } from "lucide-react";
import { CardSlabArt, type ArtCard } from "@/components/card-slab-art";
import { SAMPLE_SLABS } from "@/components/landing/sample-cards";
import { PostBody, PostPill } from "@/components/timeline-ui";
import { EASE, cancelAll, canAnimate, prefersReducedMotion, rise, watchVisible } from "./motion";
import { REAL_PICKUP_POST, SAMPLE_POSTS, avatarSrc, type PickupDemo, type SamplePost } from "./sample-data";

const NO_PHOTO = { kind: "none" } as const;
const noop = () => {};
/** One post moves up every this long, with the brand easing. */
const STEP_MS = 2600;
const MOVE_MS = 500;

/**
 * The feed, slowly moving: sample pickups, questions and a reply from the
 * demo personas. Drawn with the feed's own parts (PostBody, PostPill, the
 * slab art) in the feed row's layout. Handles are plain text: these are
 * sample accounts, never linked and never followable. `pickup` is a real
 * slab from the founder's collection for Paolo's pickup; a photo that fails
 * puts the sample slab back.
 */
export default function TimelineDemo({ run, pickup = null }: { run: number; pickup?: PickupDemo | null }) {
  const [real, setReal] = useState(pickup);
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [reduce] = useState(prefersReducedMotion);
  const posts = reduce ? SAMPLE_POSTS.slice(0, 3) : SAMPLE_POSTS;
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(reduce ? SAMPLE_POSTS.map((post) => post.id) : []));
  const controls = useRef<{ restart: () => void } | null>(null);

  useEffect(() => {
    const node = root.current;
    const list = track.current;
    if (!node || !list || reduce || !canAnimate(list)) return;
    let index = 0;
    let timer = 0;
    let running = false;
    let revealed = false;
    let move: Animation | null = null;
    const firstCopy = () => [...list.querySelectorAll<HTMLElement>("[data-copy='0'] > li")];

    /** Ticks the like count of every post that is now on screen. */
    function tickVisible(shift: number) {
      const height = node!.clientHeight;
      const seen = firstCopy()
        .filter((item) => item.offsetTop - shift < height - 24)
        .map((item) => item.dataset.post ?? "");
      setTicked((current) => (seen.every((id) => current.has(id)) ? current : new Set([...current, ...seen])));
    }

    function step() {
      const items = firstCopy();
      if (items.length === 0) return;
      const from = items[index]?.offsetTop ?? 0;
      index += 1;
      // The copy starts where the first list ends, so the loop has no seam.
      const copyStart = (list!.querySelector<HTMLElement>("[data-copy='1']")?.offsetTop ?? 0) - (items[0]?.offsetTop ?? 0);
      const to = index >= items.length ? copyStart : (items[index]?.offsetTop ?? 0) - (items[0]?.offsetTop ?? 0);
      const start = from - (items[0]?.offsetTop ?? 0);
      cancelAll([move]);
      move = list!.animate([{ transform: `translateY(${-start}px)` }, { transform: `translateY(${-to}px)` }], {
        duration: MOVE_MS,
        easing: EASE,
        fill: "forwards",
      });
      if (index >= items.length) {
        index = 0;
        move.onfinish = () => {
          list!.style.transform = "translateY(0)";
          move?.cancel();
        };
      }
      tickVisible(to);
      timer = window.setTimeout(step, STEP_MS);
    }

    function resume() {
      if (running) return;
      running = true;
      if (!revealed) {
        revealed = true;
        rise(node);
        tickVisible(0);
      }
      timer = window.setTimeout(step, STEP_MS);
    }

    function pause() {
      running = false;
      window.clearTimeout(timer);
    }

    controls.current = {
      restart() {
        pause();
        cancelAll([move]);
        index = 0;
        list!.style.transform = "translateY(0)";
        setTicked(new Set());
        window.setTimeout(() => {
          tickVisible(0);
          resume();
        }, 60);
      },
    };

    // Paused off screen and in a hidden tab.
    const unwatch = watchVisible(node, (visible) => (visible ? resume() : pause()), 0.2);
    return () => {
      unwatch();
      pause();
      cancelAll([move]);
      controls.current = null;
    };
  }, [reduce]);

  useEffect(() => {
    if (run > 0) controls.current?.restart();
  }, [run]);

  return (
    <div
      ref={root}
      data-showcase-demo="timeline"
      className="relative h-full overflow-hidden rounded-2xl border border-white/[0.08] bg-[#09090B] [mask-image:linear-gradient(to_bottom,black_88%,transparent)]"
    >
      <div ref={track}>
        <ul data-copy="0">
          {posts.map((post) => (
            <PostRow key={post.id} post={post} liked={ticked.has(post.id)} real={post.id === REAL_PICKUP_POST ? real : null} onPhotoError={() => setReal(null)} />
          ))}
        </ul>
        {reduce ? null : (
          <ul data-copy="1" aria-hidden inert>
            {posts.map((post) => (
              <PostRow key={post.id} post={post} liked real={post.id === REAL_PICKUP_POST ? real : null} onPhotoError={() => setReal(null)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PostRow({
  post,
  liked,
  real,
  onPhotoError,
}: {
  post: SamplePost;
  liked: boolean;
  real: PickupDemo | null;
  onPhotoError: () => void;
}) {
  const { persona } = post;
  const likes = liked ? post.likes : post.likes - 1;
  return (
    <li data-post={post.id} className={`border-b border-white/[0.07] ${post.replyTo ? "pl-8" : ""}`}>
      <article className="flex gap-3 px-4 pt-3.5 pb-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatarSrc(persona)}
          alt=""
          width={40}
          height={40}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-10 w-10 shrink-0 rounded-full bg-zinc-800 object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-baseline gap-1 text-[15px] leading-5">
            <span className="max-w-[52%] shrink-0 truncate font-semibold text-zinc-100">{persona.name}</span>
            <span className="min-w-0 truncate text-zinc-400">@{persona.handle}</span>
            <span aria-hidden className="shrink-0 text-zinc-400">
              ·
            </span>
            <span className="shrink-0 text-zinc-400 tabular-nums">{post.ago}</span>
          </p>
          {post.replyTo ? <p className="text-[13px] leading-5 text-zinc-400">Replying to @{post.replyTo.handle}</p> : null}
          <div className="mt-1 text-zinc-100">
            <PostBody text={post.body} collapsible={false} />
          </div>
          {post.pickup ? (
            <div className="mt-3 flex items-center gap-3">
              <div className="w-16 shrink-0">
                {post.id === "p1" ? (
                  // Donnie's own card, used with his OK. Plain and lazy: no optimizer.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src="/landing/kitchen-table-card.webp" alt="Numbered patch card in a top-loader" width={300} height={420} loading="lazy" decoding="async" draggable={false} className="aspect-[5/7] w-16 rounded-md border border-white/10 object-cover" />
                ) : real ? (
                  <RealSlab pickup={real} onError={onPhotoError} />
                ) : (
                  <CardSlabArt card={SAMPLE_SLABS[1]} index={9} source={NO_PHOTO} status="loading" onStatus={noop} sizes="64px" />
                )}
              </div>
              <PostPill label="Pickup" />
            </div>
          ) : null}
          <div className="mt-1 flex h-9 items-center gap-6 text-[13px] text-zinc-400 tabular-nums">
            <span className="flex items-center gap-1.5">
              <MessageCircle aria-hidden size={16} strokeWidth={1.5} />
              <span className="sr-only">Replies</span>
              {post.replies}
            </span>
            <span className="flex items-center gap-1.5">
              <Heart aria-hidden size={16} strokeWidth={1.5} />
              <span className="sr-only">Likes</span>
              <Tick key={likes} value={likes} animate={liked} />
            </span>
          </div>
        </div>
      </article>
    </li>
  );
}

/** The founder's real slab, drawn like a feed pickup. Only its player, grade and photo. */
function RealSlab({ pickup, onError }: { pickup: PickupDemo; onError: () => void }) {
  const [status, setStatus] = useState<PhotoStatus>("loading");
  const card: ArtCard = {
    playerName: pickup.player,
    year: 0,
    yearLabel: "",
    setBrand: "",
    grade: pickup.grade,
    gradeQualifier: "",
    certNumber: "",
    accent: "#7C3AED",
    conditionType: "graded",
    grader: pickup.grader,
  };
  return (
    <div role="img" aria-label={`${pickup.player}, ${pickup.grader} ${pickup.grade}`} data-real-pickup="">
      <CardSlabArt
        card={card}
        index={9}
        source={{ kind: "optimized", src: pickup.photoUrl }}
        status={status}
        onStatus={(event) => {
          if (event === "error") onError();
          else setStatus("loaded");
        }}
        sizes="64px"
      />
    </div>
  );
}

/** A like count that ticks up once: the new number rises into place. */
function Tick({ value, animate }: { value: number; animate: boolean }) {
  return (
    <span
      className="inline-block"
      ref={(node) => {
        if (!node || !animate || prefersReducedMotion() || !canAnimate(node)) return;
        node.animate(
          [
            { opacity: 0, transform: "translateY(6px)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          { duration: 180, easing: EASE },
        );
      }}
    >
      {value}
    </span>
  );
}

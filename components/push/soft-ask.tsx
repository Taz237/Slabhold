"use client";

import { useEffect, useId, useRef } from "react";
import { Bell, Heart, Mail, MessageCircle, Share, UserPlus } from "lucide-react";

const RISE = "motion-safe:animate-[composer-in_240ms_cubic-bezier(0.2,0.7,0.2,1)_both]";
const FADE = "motion-safe:animate-[lightbox-fade_200ms_ease-out_both]";

const TOPICS = [
  { icon: UserPlus, label: "Follows" },
  { icon: Heart, label: "Likes" },
  { icon: MessageCircle, label: "Replies" },
  { icon: Mail, label: "Messages" },
] as const;

/**
 * The notifications soft-ask. A bottom sheet on phones, a centered card on
 * desktop. "push" asks for permission (from the tap itself, which iOS needs);
 * "add-to-home" is for iOS Safari tabs, which must install the app first.
 */
export function SoftAsk({
  surface,
  onPrimary,
  onDismiss,
}: {
  surface: "push" | "add-to-home";
  onPrimary: () => void;
  onDismiss: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    primaryRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, []);

  const home = surface === "add-to-home";
  const title = home ? "Get notifications on iPhone" : "Turn on notifications";
  const body = home
    ? "Add Slabhold to your Home Screen to get notifications when collectors follow you, reply, or message you."
    : "Know when collectors follow you, like or reply to your posts, and message you.";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center" data-push-soft-ask="">
      <button
        type="button"
        aria-label="Not now"
        tabIndex={-1}
        onClick={onDismiss}
        className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] ${FADE}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className={`relative w-full max-w-md rounded-t-2xl bg-white px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-zinc-950 shadow-2xl ring-1 ring-black/5 md:mx-4 md:rounded-2xl md:p-6 dark:bg-[#18181B] dark:text-[#F4F4F5] dark:ring-white/10 ${RISE}`}
      >
        <span aria-hidden className="mx-auto mb-4 block h-1 w-10 rounded-full bg-zinc-300 md:hidden dark:bg-white/15" />
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#7C3AED]/10 text-[#7C3AED] dark:bg-[#7C3AED]/20 dark:text-[#A78BFA]"
          >
            <Bell className="h-6 w-6" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <h2 id={titleId} className="text-[20px] leading-6 font-extrabold tracking-tight">
              {title}
            </h2>
            <p id={bodyId} className="mt-1.5 text-[15px] leading-[1.35rem] text-zinc-600 dark:text-zinc-400">
              {body}
            </p>
          </div>
        </div>

        {home ? (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-zinc-100 px-3 py-2.5 text-[13px] text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-400">
            <Share aria-hidden className="h-4 w-4 shrink-0 text-[#7C3AED] dark:text-[#A78BFA]" />
            <span>
              Tap <span className="font-semibold text-zinc-900 dark:text-zinc-100">Share</span>, then{" "}
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">Add to Home Screen</span>.
            </span>
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-4 gap-2" aria-label="You'll hear about">
            {TOPICS.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex flex-col items-center gap-1 rounded-xl bg-zinc-100 px-1 py-2.5 dark:bg-white/[0.06]"
              >
                <Icon aria-hidden className="h-4 w-4 text-[#7C3AED] dark:text-[#A78BFA]" />
                <span className="font-mono text-[10px] font-medium tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                  {label}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 flex flex-col gap-1.5">
          <button
            ref={primaryRef}
            type="button"
            onClick={onPrimary}
            className="tap h-12 rounded-full bg-violet-600 text-[15px] font-bold text-white transition-colors hover:bg-violet-700 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:ring-offset-2 focus-visible:outline-none dark:focus-visible:ring-offset-[#18181B]"
          >
            {home ? "Show me how" : "Turn on"}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="tap h-11 rounded-full text-[15px] font-semibold text-zinc-600 hover:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none dark:text-zinc-400 dark:hover:bg-white/[0.06]"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

/** "Notifications on" after a granted permission. */
export function PushToast({ text }: { text: string }) {
  return (
    <div
      role="status"
      className={`fixed top-[calc(env(safe-area-inset-top)+0.75rem)] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-950 ${FADE}`}
    >
      <Bell aria-hidden className="h-4 w-4 text-[#A78BFA] dark:text-[#7C3AED]" />
      {text}
    </div>
  );
}

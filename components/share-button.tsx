"use client";

import { useEffect, useRef, useState } from "react";
import { Share } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { postSharePayload, shareOrCopy } from "@/lib/share/sheet";
import { publicOrigin } from "@/lib/site-url";

export function absoluteUrl(path: string) {
  return new URL(path, publicOrigin(window.location.origin)).href;
}

export async function copyText(value: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // The clipboard API exists in some browsers but still rejects the write.
  }
  try {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "0";
    field.style.left = "0";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.focus();
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  } catch {
    return false;
  }
}

async function shareLink(path: string, title: string, text: string) {
  const url = absoluteUrl(path);
  return shareOrCopy(postSharePayload({ title, text, url }), {
    share: navigator.share?.bind(navigator),
    copy: copyText,
  });
}

function useShare(path: string, title: string, text: string) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function share(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    trackEvent("share_clicked");
    let result: Awaited<ReturnType<typeof shareLink>>;
    try {
      result = await shareLink(path, title, text);
    } catch {
      return;
    }
    if (result !== "copied") return;
    setCopied(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), 1800);
  }

  return { copied, share };
}

function CopiedToast() {
  return (
    <p
      role="status"
      className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-sm font-bold text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-950"
    >
      Link copied
    </p>
  );
}

export function ShareAction({
  path,
  title,
  text,
}: {
  path: string;
  title: string;
  text?: string;
}) {
  const { copied, share } = useShare(path, title, text ?? title);

  return (
    <>
      <button
        type="button"
        aria-label="Share"
        onClick={(event) => void share(event)}
        className="group inline-flex min-h-11 min-w-0 flex-1 items-center text-zinc-500 hover:text-sky-500"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full group-hover:bg-sky-500/10">
          <Share className="h-[18px] w-[18px]" />
        </span>
      </button>
      {copied ? <CopiedToast /> : null}
    </>
  );
}

export function ShareIconButton({
  path,
  title,
  label,
}: {
  path: string;
  title: string;
  label: string;
}) {
  const { copied, share } = useShare(path, title, title);

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={(event) => void share(event)}
        className="hit-44 grid h-11 w-11 shrink-0 place-items-center rounded-full border border-zinc-300 text-zinc-800 dark:border-white/20 dark:text-zinc-100"
      >
        <Share className="h-4 w-4" />
      </button>
      {copied ? <CopiedToast /> : null}
    </>
  );
}

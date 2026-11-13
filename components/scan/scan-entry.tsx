import Link from "next/link";
import { ScanLine } from "lucide-react";
import { focusRing } from "@/components/add-card/flow-ui";

/**
 * The scanner's way in: one big, one-thumb row with the camera mark in brand
 * purple. Add card shows it first; Quick Comp shows it under its heading.
 */
export function ScanEntry({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link
      href={href}
      data-scan-entry=""
      className={`flex min-h-16 w-full items-center gap-4 rounded-2xl border border-zinc-200 bg-white px-4 py-3 transition-[background-color,border-color,transform] duration-150 ease-out hover:border-violet-400 motion-safe:active:scale-[0.99] motion-reduce:transition-none dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-violet-400/60 ${focusRing}`}
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-violet-600 text-white">
        <ScanLine className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold">{title}</span>
        <span className="block truncate text-[13px] text-zinc-500 dark:text-zinc-400">{body}</span>
      </span>
    </Link>
  );
}

"use client";

import { Search } from "lucide-react";
import { PartLoadFailed } from "@/components/part-load-failed";
import { lazyPart } from "@/lib/ui/lazy-part";
import { control, textMuted, textSecondary } from "./tokens";

type Props = { userId: string | null };

/** The server's paint: the header and the search box in their final spots. */
function QuickCompShell() {
  return (
    <div data-quick-comp-shell="" className="flex flex-col gap-5 pt-1">
      <header>
        <h1 className="text-xl leading-7 font-semibold tracking-tight">Quick Comp</h1>
        <p className={`mt-1 text-sm leading-5 ${textSecondary}`}>Recent sold prices, without adding it to your collection</p>
      </header>
      <div>
        <div className={`${control} gap-2 px-3`}>
          <Search aria-hidden="true" size={16} strokeWidth={1.5} className={`shrink-0 ${textMuted}`} />
          <span className={`min-h-11 flex-1 py-3 text-base leading-5 sm:text-sm ${textMuted}`}>Player, year, set or number</span>
        </div>
        <div className="mt-1 h-11" />
      </div>
    </div>
  );
}

/** Quick Comp from its own chunk. Only /comp imports this. */
export const QuickCompLazy = lazyPart<Props>(
  () => import("./quick-comp-view").then((mod) => mod.QuickCompView),
  QuickCompShell,
  { name: "quick-comp", failed: PartLoadFailed },
);

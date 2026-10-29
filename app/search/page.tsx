import { Suspense } from "react";
import { Search } from "lucide-react";
import { SearchView } from "@/components/search-view";
import { LoadingRows } from "@/components/status";

function SearchFallback() {
  return (
    <div className="-mx-4 -mt-5">
      <div className="sticky top-[var(--app-header-h)] z-10 border-b border-zinc-200 bg-[var(--background)] px-4 py-2.5 dark:border-white/10">
        <label className="flex min-h-12 items-center gap-2 rounded-full bg-zinc-100 px-3 dark:bg-white/10">
          <Search className="h-5 w-5 shrink-0 text-zinc-500" />
          <input
            type="search"
            enterKeyHint="search"
            placeholder="Search"
            aria-label="Search"
            maxLength={100}
            readOnly
            className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-zinc-500"
          />
        </label>
      </div>
      <LoadingRows />
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<SearchFallback />}>
      <SearchView />
    </Suspense>
  );
}

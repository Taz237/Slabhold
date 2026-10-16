import { Suspense } from "react";
import { SearchView } from "@/components/search-view";
import { LoadingRows } from "@/components/status";

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="-mx-4 -mt-5">
          <LoadingRows />
        </div>
      }
    >
      <SearchView />
    </Suspense>
  );
}

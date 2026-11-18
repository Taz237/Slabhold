import type { ReactNode } from "react";
import { AddCardLink } from "@/components/add-card-link";

/** Collection title plus Add a card, for a collection with no cards yet. `actions` sit before Add a card. */
export function CollectionHeader({ actions }: { actions?: ReactNode }) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Collection</h1>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          {actions}
          <AddCardLink />
        </div>
      </div>
    </div>
  );
}

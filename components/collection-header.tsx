import { AddCardLink } from "@/components/add-card-link";

/** Collection title plus Add a card, including when the book already has cards. */
export function CollectionHeader() {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Your book</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Collection</h1>
      </div>
      <div className="flex max-w-full flex-wrap items-center gap-2">
        <AddCardLink />
      </div>
    </div>
  );
}

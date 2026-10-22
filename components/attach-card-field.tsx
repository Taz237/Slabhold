import Link from "next/link";

type CardOption = {
  id: string;
  year: number;
  playerName: string;
};

const addLinkClass =
  "inline-flex min-h-11 shrink-0 items-center rounded-full px-2 text-xs font-semibold text-violet-700 underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none dark:text-violet-300";

/** Card picker for compose. An empty book gets a link into the add-card flow. */
export function AttachCardField({
  cards,
  value,
  onChange,
  selectClassName,
}: {
  cards: CardOption[];
  value: string;
  onChange: (id: string) => void;
  selectClassName: string;
}) {
  if (cards.length === 0) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-xs text-zinc-500">Attach a card</span>
        <Link href="/cards/new" className={addLinkClass}>
          Add a card
        </Link>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Attach a card"
      className={selectClassName}
    >
      <option value="">Attach a card</option>
      {cards.map((card) => (
        <option key={card.id} value={card.id}>
          {card.year} {card.playerName}
        </option>
      ))}
    </select>
  );
}

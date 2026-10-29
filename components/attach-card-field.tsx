import Link from "next/link";
import { Check } from "lucide-react";
import { initials } from "@/lib/format";

type CardOption = {
  id: string;
  year: number;
  playerName: string;
  setBrand?: string;
  photoDataUrl?: string | null;
  accent?: string;
};

const addLinkClass =
  "inline-flex min-h-11 shrink-0 items-center rounded-full px-2 text-xs font-semibold text-violet-700 underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-violet-600 focus-visible:outline-none dark:text-violet-300";

/**
 * Card picker for compose. An empty book gets a link into the add-card flow.
 * `list` draws tappable rows with a thumbnail, for the composer's card sheet.
 */
export function AttachCardField({
  cards,
  value,
  onChange,
  selectClassName = "",
  variant = "select",
}: {
  cards: CardOption[];
  value: string;
  onChange: (id: string) => void;
  selectClassName?: string;
  variant?: "select" | "list";
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

  if (variant === "list") {
    return (
      <ul aria-label="Attach a card" className="divide-y divide-zinc-200 dark:divide-white/10">
        {cards.map((card) => {
          const selected = card.id === value;
          return (
            <li key={card.id}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onChange(card.id)}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-zinc-100 dark:active:bg-white/5"
              >
                {card.photoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.photoDataUrl}
                    alt=""
                    loading="lazy"
                    width={32}
                    height={44}
                    className="h-11 w-8 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="grid h-11 w-8 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white"
                    style={{ background: `linear-gradient(160deg, ${card.accent ?? "#7C3AED"}, #18181b)` }}
                  >
                    {initials(card.playerName)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{card.playerName}</span>
                  <span className="block truncate text-xs text-zinc-500">
                    {card.year}
                    {card.setBrand ? ` ${card.setBrand}` : ""}
                  </span>
                </span>
                {selected ? <Check aria-hidden className="h-5 w-5 shrink-0 text-[#7C3AED] dark:text-[#A78BFA]" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
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

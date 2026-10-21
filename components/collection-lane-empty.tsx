import { WalletCards } from "lucide-react";
import { outlineButton } from "@/components/button-styles";
import { EmptyState } from "@/components/status";
import { collectionFilterEmpty } from "@/lib/collection/lane-empty";
import type { CardCategory } from "@/lib/types";

export function CollectionLaneEmpty({
  lane,
  onShowAll,
}: {
  lane: CardCategory;
  onShowAll?: () => void;
}) {
  const copy = collectionFilterEmpty(lane);
  return (
    <EmptyState
      icon={<WalletCards className="h-5 w-5" />}
      title={copy.title}
      detail={copy.detail}
    >
      {onShowAll ? (
        <button type="button" onClick={onShowAll} className={outlineButton}>
          Show all cards
        </button>
      ) : null}
    </EmptyState>
  );
}

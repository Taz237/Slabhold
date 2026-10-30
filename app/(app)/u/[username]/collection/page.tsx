import type { Metadata } from "next";
import { PublicCollection } from "@/components/invite/public-collection";
import { inviteHandle } from "@/lib/invites/attribution";
import { loadCollectionCollector } from "@/lib/invites/load";
import { previewMetadata } from "@/lib/social/link-preview";

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const handle = inviteHandle(username);
  const collector = handle ? await loadCollectionCollector(handle) : null;
  if (!collector) {
    return previewMetadata({
      title: "Collections on Slabhold",
      description: "Track your cards with recent sold prices, and share the ones you're proud of.",
      imageUrl: null,
      detail: "",
    });
  }
  const count = collector.publicCardCount ?? collector.cards.length;
  return previewMetadata({
    title: `${collector.displayName}'s collection`,
    description: `${count} ${count === 1 ? "card" : "cards"} from @${collector.username} on Slabhold.`,
    imageUrl: null,
    detail: "",
  });
}

/** Public, read-only collection. Unknown, reserved or private handles get the generic page. */
export default async function PublicCollectionPage({ params }: Props) {
  const { username } = await params;
  const handle = inviteHandle(username);
  const collector = handle ? await loadCollectionCollector(handle) : null;
  return <PublicCollection handle={handle} collector={collector} />;
}

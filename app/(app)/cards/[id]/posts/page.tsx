import { CardPostsList } from "@/components/card-posts-list";
import { requireCardPostsAccess } from "@/lib/value/require-card-page-access";

type Props = { params: Promise<{ id: string }> };

export default async function CardPostsPage({ params }: Props) {
  const { id } = await params;
  await requireCardPostsAccess(id);
  return <CardPostsList cardId={id} />;
}

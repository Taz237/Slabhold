import { CardPostsList } from "@/components/card-posts-list";
import { requireCardPageAccess } from "@/lib/value/require-card-page-access";

type Props = { params: Promise<{ id: string }> };

export default async function CardPostsPage({ params }: Props) {
  const { id } = await params;
  await requireCardPageAccess(id);
  return <CardPostsList cardId={id} />;
}

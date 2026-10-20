import { EditCardPage } from "@/components/edit-card-page";
import { requireCardPageAccess } from "@/lib/value/require-card-page-access";

type Props = { params: Promise<{ id: string }> };

export default async function Page({ params }: Props) {
  const { id } = await params;
  await requireCardPageAccess(id);
  return <EditCardPage id={id} />;
}

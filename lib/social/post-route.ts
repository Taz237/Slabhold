import { isUuid } from "@/lib/value/card-value-access";

/** `/posts/[id]` for a real post id. Other routes keep the full social snapshot. */
export function postIdFromPath(pathname: string): string | null {
  const cut = pathname.split("?")[0]?.split("#")[0] ?? "";
  const path = cut.length > 1 && cut.endsWith("/") ? cut.slice(0, -1) : cut;
  const match = /^\/posts\/([^/]+)$/.exec(path);
  const id = match?.[1];
  if (!id || !isUuid(id)) return null;
  return id;
}

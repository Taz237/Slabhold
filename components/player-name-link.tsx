import Link from "next/link";
import { linkedPlayerHref } from "@/lib/players/link-href";

/** Player name that opens /p/[player]. Plain text when that slug would not resolve. */
export function PlayerNameLink({
  name,
  sport,
  className,
}: {
  name: string;
  sport?: string | null;
  className?: string;
}) {
  const href = linkedPlayerHref(name, sport);
  if (!href) return <span className={className}>{name}</span>;
  return (
    <Link href={href} className={className}>
      {name}
    </Link>
  );
}

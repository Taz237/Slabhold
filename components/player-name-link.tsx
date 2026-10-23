import Link from "next/link";
import { playerHref } from "@/lib/players/slug";

/** Player name that opens /p/[player]. Plain text when the name is not a sports player. */
export function PlayerNameLink({
  name,
  sport,
  className,
}: {
  name: string;
  sport?: string | null;
  className?: string;
}) {
  const href = playerHref(name, sport);
  if (!href) return <span className={className}>{name}</span>;
  return (
    <Link href={href} className={className}>
      {name}
    </Link>
  );
}

import Link from "next/link";

export function MentionText({ text }: { text: string }) {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  const token = /(^|[^a-zA-Z0-9_])(@[a-zA-Z0-9_]{3,20})(?![a-zA-Z0-9_])/g;
  for (const match of text.matchAll(token)) {
    const boundary = match[1];
    const mention = match[2];
    const start = (match.index ?? 0) + boundary.length;
    if (start > last) nodes.push(text.slice(last, start));
    const username = mention.slice(1).toLowerCase();
    nodes.push(
      <Link
        key={`${start}-${username}`}
        href={`/u/${username}`}
        className="font-medium text-sky-600 hover:underline dark:text-sky-400"
      >
        {mention}
      </Link>,
    );
    last = start + mention.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  if (nodes.length === 0) return text;
  return <>{nodes}</>;
}

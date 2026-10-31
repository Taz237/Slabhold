import Link from "next/link";
import { splitPostText, type PostTextPart } from "@/lib/social/post-text";
import { userHref } from "@/lib/social/user-href";

const MENTION_CLASS = "font-medium text-sky-600 hover:underline dark:text-sky-400";
const CHECKLIST_CLASS =
  "font-medium text-violet-700 underline underline-offset-2 dark:text-violet-300";

/** External post links. noreferrer is included so the opened tab cannot see this page. */
export const EXTERNAL_LINK_REL = "noopener noreferrer nofollow ugc";

function stopParent(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

export function MentionText({
  text,
  linkClassName,
}: {
  text: string;
  /** Bubble contrast. Posts keep the default sky links. */
  linkClassName?: string;
}) {
  const parts = splitPostText(text);
  if (parts.length === 1 && parts[0].type === "text") return text;
  const tone = linkClassName ?? MENTION_CLASS;
  return (
    <>
      {parts.map((part, index) => (
        <PostTextPiece key={pieceKey(part, index)} part={part} tone={tone} linkClassName={linkClassName} />
      ))}
    </>
  );
}

function pieceKey(part: PostTextPart, index: number) {
  if (part.type === "mention") return `${index}-${part.username}`;
  if (part.type === "url") return `${index}-url`;
  if (part.type === "hashtag") return `${index}-hash`;
  if (part.type === "checklist") return `${index}-checklist`;
  return `${index}-text`;
}

function PostTextPiece({
  part,
  tone,
  linkClassName,
}: {
  part: PostTextPart;
  tone: string;
  linkClassName?: string;
}) {
  if (part.type === "text") return <span>{part.text}</span>;
  if (part.type === "mention") {
    return (
      <Link prefetch={false} href={userHref(part.username)} className={tone}>
        {part.text}
      </Link>
    );
  }
  if (part.type === "url") {
    return (
      <a
        href={part.href}
        target="_blank"
        rel={EXTERNAL_LINK_REL}
        title={part.href}
        className={`${tone} break-all`}
        onClick={stopParent}
        onKeyDown={stopParent}
      >
        {part.display}
      </a>
    );
  }
  if (part.type === "hashtag") {
    return (
      <Link
        prefetch={false}
        href={part.href}
        className={`${tone} break-all`}
        onClick={stopParent}
        onKeyDown={stopParent}
      >
        {part.text}
      </Link>
    );
  }
  return (
    <Link
      prefetch={false}
      href={part.href}
      className={linkClassName ?? CHECKLIST_CLASS}
      onClick={(event) => {
        const target = document.getElementById("get-started");
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }}
    >
      {part.text}
    </Link>
  );
}

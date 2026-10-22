import Link from "next/link";
import { splitPostText } from "@/lib/social/post-text";
import { userHref } from "@/lib/social/user-href";

export function MentionText({ text }: { text: string }) {
  const parts = splitPostText(text);
  if (parts.length === 1 && parts[0].type === "text") return text;
  return (
    <>
      {parts.map((part, index) => {
        if (part.type === "text") return <span key={index}>{part.text}</span>;
        if (part.type === "mention") {
          return (
            <Link
              key={`${index}-${part.username}`}
              href={userHref(part.username)}
              className="font-medium text-sky-600 hover:underline dark:text-sky-400"
            >
              {part.text}
            </Link>
          );
        }
        return (
          <Link
            key={`${index}-checklist`}
            href={part.href}
            className="font-medium text-violet-700 underline underline-offset-2 dark:text-violet-300"
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
      })}
    </>
  );
}

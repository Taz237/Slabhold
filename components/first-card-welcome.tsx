import Link from "next/link";
import { AddCardLink } from "@/components/add-card-link";

/** Shown on Home and Collection until the signed-in user has a card. */
export function FirstCardWelcome() {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-2xl font-bold tracking-tight">Your collection starts here</p>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-5 text-zinc-500">
        Add a card to track what you paid and what it&apos;s worth.
      </p>
      <AddCardLink prominent />
      <ul className="mx-auto mt-6 max-w-xs space-y-1.5 text-sm text-zinc-500">
        <li>
          <Link href="/search" className="font-semibold text-zinc-700 underline underline-offset-2 dark:text-zinc-200">
            Follow collectors
          </Link>{" "}
          to see what they&apos;re picking up.
        </li>
        <li>
          <Link href="/compose" className="font-semibold text-zinc-700 underline underline-offset-2 dark:text-zinc-200">
            Make a first post
          </Link>{" "}
          and say hello.
        </li>
      </ul>
    </div>
  );
}

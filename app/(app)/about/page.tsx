import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About · Slabhold" };

export default function AboutPage() {
  return (
    <article className="space-y-4 text-[15px] leading-6">
      <h1 className="text-2xl font-bold tracking-tight">About</h1>
      <p>
        Slabhold is a social app for sports card collectors. Share pulls, follow other collectors,
        and keep a book of what you hold.
      </p>
      <p>
        <Link href="/terms" className="font-bold underline">
          Terms
        </Link>
      </p>
    </article>
  );
}

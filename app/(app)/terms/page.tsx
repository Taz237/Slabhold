import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/support";

export const metadata: Metadata = { title: "Terms · Slabhold" };

export default function TermsPage() {
  return (
    <article className="space-y-4 text-[15px] leading-6">
      <h1 className="text-2xl font-semibold tracking-tight">Terms</h1>
      <p>
        Slabhold has zero tolerance for objectionable content or abusive users. Content that
        violates these terms may be removed and accounts may be suspended.
      </p>
      <p>
        You must be 13 or older to use Slabhold. Trades and sales between collectors happen
        between you and the other collector. Slabhold doesn&apos;t process payments.
      </p>
      <p>
        Don&apos;t post spam, harassment, hate, sexual content, threats, scams, or fake listings.
        Use report, block, and mute when another collector crosses the line. We review reports
        and may hide or delete posts.
      </p>
      <p>
        Contact support:{" "}
        <a className="font-medium underline" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
      </p>
      <p>
        <Link href="/about" className="font-medium underline">
          About Slabhold
        </Link>
      </p>
      <p>
        <Link href="/support" className="font-medium underline">
          Support
        </Link>
      </p>
    </article>
  );
}

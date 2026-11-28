import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/support";

export const metadata: Metadata = { title: "Terms · Slabhold" };

export default function TermsPage() {
  return (
    <article className="space-y-4 text-15 leading-6">
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
        Reports are reviewed within 24 hours. When content breaks these terms we remove it, and
        we remove the account that posted it.
      </p>
      <h2 id="deals" className="scroll-mt-20 pt-2 text-lg font-semibold tracking-tight">
        Deals between collectors
      </h2>
      <p>
        Slabhold doesn&apos;t sell cards, handle payments or check deals. Any deal you make with
        another collector is only between you and the other collector. Slabhold isn&apos;t a
        party to it and isn&apos;t responsible for how it goes.
      </p>
      <p>
        Vouches are collectors&apos; own opinions about deals they say they did, and we
        don&apos;t check them. When you pay for a card, use a payment method with buyer
        protection.
      </p>
      <h2 className="pt-2 text-lg font-semibold tracking-tight">Using Slabhold</h2>
      <p>
        You get a personal licence to use Slabhold on devices you own or control. You can&apos;t
        resell it, copy it, or use it to break the law. What you post stays yours; posting it
        lets us show it in Slabhold. You can delete your account and everything stored for it
        at any time in Settings, under Privacy &amp; safety.
      </p>
      <p>
        The iPhone app is also covered by{" "}
        <a
          className="font-medium underline"
          href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
        >
          Apple&apos;s standard licence agreement
        </a>
        .
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

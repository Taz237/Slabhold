import type { Metadata } from "next";
import Link from "next/link";
import { Ellipsis } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/support";

export const metadata: Metadata = {
  title: "Support · Slabhold",
  description: "Contact the Slabhold team, report or block a collector, and delete your account.",
};

const heading = "pt-2 text-lg font-semibold tracking-tight";

function MoreGlyph() {
  return (
    <Ellipsis
      aria-hidden="true"
      strokeWidth={1.5}
      className="inline-block h-4 w-4 align-[-0.125em] text-zinc-500"
    />
  );
}

export default function SupportPage() {
  return (
    <article className="space-y-4 text-[15px] leading-6">
      <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
      <p>How to reach the team, report or block a collector, and manage your account.</p>

      <h2 className={heading}>Contact</h2>
      <p>
        Email the team at{" "}
        <a className="font-medium underline" href={`mailto:${SUPPORT_EMAIL}`}>
          {SUPPORT_EMAIL}
        </a>
      </p>

      <h2 className={heading}>Report a post, reply or collector</h2>
      <p>
        Tap More <MoreGlyph /> on the post, reply or profile, then Report. Pick a reason and add
        details if they help. Reports are reviewed within 24 hours.
      </p>

      <h2 className={heading}>Block or mute</h2>
      <p>
        Mute and Block are in the same menu. In a DM, it&apos;s at the top of the thread. Mute
        hides their posts from you. Block stops you seeing each other&apos;s posts, replies,
        notifications and messages.
      </p>

      <h2 className={heading}>Delete your account</h2>
      <p>
        Open the menu, then{" "}
        <Link href="/settings/privacy" className="font-medium underline">
          Privacy &amp; safety
        </Link>
        , then Delete account. Type DELETE to confirm. Your account and data are removed for good.
      </p>

      <p className="flex gap-4 pt-2">
        <Link href="/terms" className="font-medium underline">
          Terms
        </Link>
        <Link href="/privacy" className="font-medium underline">
          Privacy
        </Link>
      </p>
    </article>
  );
}

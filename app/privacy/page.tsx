import type { Metadata } from "next";
import { SUPPORT_EMAIL } from "@/lib/support";

export const metadata: Metadata = { title: "Privacy · Slabhold" };

export default function PrivacyPolicyPage() {
  const email = SUPPORT_EMAIL.trim();
  return (
    <article className="space-y-4 text-[15px] leading-6">
      <h1 className="text-2xl font-bold tracking-tight">Privacy</h1>
      <p>
        Slabhold stores the account and collection details you give us so you can use the app.
      </p>
      <p>
        When you sign up we collect your email and the account details you enter: a password,
        a username, and a display name. You can also add a bio, a profile photo, and a cover image.
      </p>
      <p>
        Cards you add include the details you type in (player, year, set, grade, and the rest)
        and any photos you upload.
      </p>
      <p>
        A card stays off your public profile unless you turn on &quot;Show this card on your public
        profile.&quot; Private cards and their photos stay off your public profile and off share
        links. What you paid is optional. It is not shown on your public card. On a mail-day post
        it shows only if you choose, and never when the card is private.
      </p>
      <p>We don&apos;t sell your data.</p>
      <p>
        You can delete your account from More. Type DELETE to confirm.
      </p>
      <p>
        Contact:{" "}
        {email ? (
          <a className="font-bold underline" href={`mailto:${email}`}>
            {email}
          </a>
        ) : (
          // TODO: set SUPPORT_EMAIL in lib/support.ts
          <span>support email is not set up yet.</span>
        )}
      </p>
    </article>
  );
}

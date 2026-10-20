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
        profile.&quot; Private cards and their photos stay off your public profile and card share
        links. If you include a private card in a Mail Day post, its name and the photos you attach
        show on that post. What you paid is optional. It is not shown on your public card. On a
        mail-day post it shows only if you choose, and never when the card is private.
      </p>
      <p>We don&apos;t sell your data.</p>
      <h2 className="pt-2 text-lg font-bold tracking-tight">Services we use</h2>
      <p>
        Supabase stores accounts, the database, and photos. Vercel hosts the app. Sold prices are
        eBay sold-listing lookups. Those requests send card details (player, year, set, number,
        parallel, serial, and grade) to Trawl. They do not send your email, username, or account id.
      </p>
      <p>
        We use Vercel Web Analytics and Speed Insights to count page views and measure performance,
        with no ads and no cross-site tracking. Page views record the page type (no usernames, ids
        or search text) plus the referrer, country and device type.
      </p>
      <p>
        We use Cloudflare Turnstile on sign-up, log-in and password reset forms to block bots.
        Cloudflare processes your IP address and browser signals for this check.
      </p>
      <h2 className="pt-2 text-lg font-bold tracking-tight">Cookies and this browser</h2>
      <p>
        Signing in stores the login session in cookies. This browser&apos;s local storage keeps the
        posts you liked, recent searches, whether you dismissed the daily collection summary, and
        the PC or Flipping category for a card. If you open Slabhold from a campaign link, this
        browser keeps that link&apos;s source, medium, and campaign for 7 days. Liking, reposting,
        or deleting a post also saves the comments, reposts, and notifications loaded at that
        moment. A scan or a photo for a
        post is held in session storage until the next screen reads it. If Supabase is not
        connected, the account and collection stay in this browser.
      </p>
      <p>
        To limit price checks from visitors who aren&apos;t signed in, we store a one-way hash of
        your IP address. We keep that hash for up to two days.
      </p>
      <h2 className="pt-2 text-lg font-bold tracking-tight">What is public</h2>
      <p>
        Posts, comments, reposts, profiles, follows, and cards you mark public can be read by
        anyone, including people who are not signed in. Hidden posts are left out. If either
        account blocks the other, they do not see each other&apos;s posts or comments.
      </p>
      <h2 className="pt-2 text-lg font-bold tracking-tight">How long we keep data</h2>
      <p>We keep account data until you delete it. There is no automatic expiration.</p>
      <p>
        You can delete your account from More. Type DELETE to confirm. That removes your login,
        profile, cards, posts, comments, reposts, follows, messages you sent or received (for both
        people), want list, want alerts, notifications sent to you, collection and price history,
        flags you filed on a sold listing, and uploaded photos (card photos, avatar, cover, and
        post images). Blocks, mutes, and reports tied to the account go with the login.
        Notifications you caused for other people stay in their inbox, but your name and any preview of what you wrote are removed. Deleting
        your account or logging out does not clear this browser&apos;s storage: liked posts, recent
        searches, card categories, whether you dismissed the daily collection summary, and the
        comments, reposts, and notifications saved here stay until you clear site data.
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

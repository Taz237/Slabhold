import { getImageProps } from "next/image";
import type { LandingPost } from "@/lib/landing/timeline";

/*
 * The landing page's own post card. It looks like a Home post in dark mode
 * (avatar, name, handle, text, card photo) and does nothing: it is plain
 * server HTML with none of the signed-in app's code. The posts are real and
 * public, read on the server (lib/landing/timeline-load.ts).
 */

function Avatar({ post }: { post: LandingPost }) {
  if (!post.avatarUrl) {
    return (
      <span aria-hidden className="lp-avatar lp-avatar-initial">
        {post.name.slice(0, 1).toUpperCase()}
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={post.avatarUrl} alt="" width={40} height={40} loading="lazy" decoding="async" className="lp-avatar" />;
}

function PostCard({ post }: { post: LandingPost }) {
  const alt = post.cardLabel || `A card photo posted by @${post.handle}`;
  const card = post.photoKind === "card";
  // Resized for its slot by the image optimizer (about 600px wide on a phone), never the full upload.
  const { props } = getImageProps({
    src: post.photoUrl,
    alt,
    width: 500,
    height: card ? 700 : 625,
    sizes: card ? "260px" : "(min-width: 640px) 480px, 76vw",
    quality: 75,
  });
  return (
    <li className="lp-post" data-landing-post={post.id}>
      <Avatar post={post} />
      <div className="lp-post-body">
        <p className="lp-post-who">
          <span className="lp-post-name">{post.name}</span>
          <span className="lp-post-handle">@{post.handle}</span>
        </p>
        {post.text ? <p className="lp-post-text">{post.text}</p> : null}
        <figure className="lp-post-photo" data-kind={post.photoKind}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img {...props} alt={alt} />
          {post.cardLabel ? <figcaption>{post.cardLabel}</figcaption> : null}
        </figure>
      </div>
    </li>
  );
}

/** The posts, newest first. Nothing is drawn for an empty list. */
export function LandingTimeline({ posts }: { posts: readonly LandingPost[] }) {
  if (!posts.length) return null;
  return (
    <ul className="lp-feed" data-landing-timeline="" aria-label="Recent posts on Slabhold">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </ul>
  );
}

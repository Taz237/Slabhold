import type { SupabaseClient } from "@supabase/supabase-js";
import { PRIVATE_OG_CACHE_CONTROL, reachableShare, renderOg } from "@/components/og-frame";
import { STORY } from "@/components/og-share";
import { postStoryFilename } from "./links";
import { readPostStory, withInviteCode } from "./post-story";
import { saveImageHeaders } from "./save-image";

/** What the route knows about the person asking. Tests pass fakes. */
export type PostStoryViewer = {
  /** True when the viewer's own session can read the post (blocks apply). Null without Supabase. */
  canSee: (id: string) => Promise<boolean | null>;
  /** Signed-in user id, or null. */
  id: () => Promise<string | null>;
  /** The signed-in user's own invite code (my_invite_code). Only asked for the author. */
  inviteCode: () => Promise<string | null>;
};

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": PRIVATE_OG_CACHE_CONTROL } });
}

/**
 * 1080×1920 PNG of one post, saved as a file. A post the viewer can't see, or
 * a visitor couldn't, is a 404. The image depends on who asks (blocks, and
 * the author's own invite code), so it is never stored on a shared cache.
 */
export async function postStoryResponse(
  id: string,
  anon: SupabaseClient | null,
  viewer: PostStoryViewer,
): Promise<Response> {
  if ((await viewer.canSee(id)) === false) return notFound();
  const read = await readPostStory(anon, id);
  if (!read) return notFound();
  const viewerId = await viewer.id();
  const code = viewerId && viewerId === read.authorId ? await viewer.inviteCode() : null;
  const model = withInviteCode(read, viewerId, code);
  const image = await renderOg(await reachableShare(model), PRIVATE_OG_CACHE_CONTROL, STORY);
  return new Response(image.body, {
    status: 200,
    headers: saveImageHeaders(postStoryFilename(read.username), PRIVATE_OG_CACHE_CONTROL),
  });
}

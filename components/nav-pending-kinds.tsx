import { PostPageSkeleton } from "@/components/post-skeleton";
import { ProfileSkeleton } from "@/components/status";

/**
 * The post and profile skeletons a tap shows at once (NavPendingSkeleton).
 * Their own chunk, loaded after the first idle moment, so no page's first
 * load carries them.
 */
export function NavPendingKinds() {
  return (
    <>
      <div data-pending-kind="post">
        <PostPageSkeleton />
      </div>
      <div data-pending-kind="profile">
        <ProfileSkeleton />
      </div>
    </>
  );
}

import { AppShell } from "@/components/app-shell";
import { CollectionProvider } from "@/components/collection-provider";
import { ImageLightboxProvider } from "@/components/image-lightbox";
import { SocialProvider } from "@/components/social-provider";

/**
 * The app around every page but the signed-out landing page: the social and
 * collection state and the shell. The landing route (app/welcome) renders
 * without it, so visitors never download it.
 */
export function AppChrome({ children }: { children: React.ReactNode }) {
  return (
    <ImageLightboxProvider>
      <SocialProvider>
        <CollectionProvider>
          <AppShell>{children}</AppShell>
        </CollectionProvider>
      </SocialProvider>
    </ImageLightboxProvider>
  );
}

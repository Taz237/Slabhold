import { Suspense } from "react";
import { ComposeFallback, ComposeView } from "@/components/compose-view";

export default function ComposePage() {
  return (
    <Suspense fallback={<ComposeFallback />}>
      <ComposeView />
    </Suspense>
  );
}

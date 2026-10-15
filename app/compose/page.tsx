import { Suspense } from "react";
import { ComposeView } from "@/components/compose-view";
import { LoadingRows } from "@/components/status";

export default function ComposePage() {
  return (
    <Suspense
      fallback={
        <div className="-mx-4 -mt-5">
          <LoadingRows count={2} />
        </div>
      }
    >
      <ComposeView />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign up · Slabhold" };

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto h-40 max-w-md skeleton-shimmer rounded-2xl" />
      }
    >
      <AuthForm mode="signup" />
    </Suspense>
  );
}

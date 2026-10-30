import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata: Metadata = { title: "Sign up · Slabhold" };

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto h-40 max-w-md animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/5" />
      }
    >
      <AuthForm mode="signup" />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password · Slabhold" };

export default function ForgotPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto h-40 max-w-md animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/5" />
      }
    >
      <ForgotPasswordForm />
    </Suspense>
  );
}

import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata: Metadata = { title: "Forgot password · Slabhold" };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}

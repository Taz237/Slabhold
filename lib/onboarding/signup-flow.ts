import { emailFieldError, passwordFieldError, usernameFieldError } from "@/lib/auth/signup-fields";
import { normalizeUsername } from "@/lib/social/local-db";
import { TAKEN_USERNAME } from "@/lib/social/username-taken";

/** One question per screen, in this order. Submit follows the last one. */
export const SIGNUP_STEPS = ["email", "password", "username", "name"] as const;

export type SignupStep = (typeof SIGNUP_STEPS)[number];

export type SignupValues = {
  email: string;
  password: string;
  username: string;
  displayName: string;
};

/** Where the live username check stands. "unknown" means the lookup failed. */
export type UsernameState = "idle" | "checking" | "available" | "taken" | "invalid" | "unknown";

export const DISPLAY_NAME_MAX = 50;

export function nextSignupStep(step: SignupStep): SignupStep | "submit" {
  const index = SIGNUP_STEPS.indexOf(step);
  return SIGNUP_STEPS[index + 1] ?? "submit";
}

export function previousSignupStep(step: SignupStep): SignupStep | "exit" {
  const index = SIGNUP_STEPS.indexOf(step);
  return index <= 0 ? "exit" : SIGNUP_STEPS[index - 1];
}

/** 0.25 on the first step, 1 on the last. */
export function signupProgress(step: SignupStep): number {
  return (SIGNUP_STEPS.indexOf(step) + 1) / SIGNUP_STEPS.length;
}

/**
 * Why Continue can't move on yet, or null. Uses the same checks as the
 * server, so nothing here is looser than sign-up itself.
 */
export function signupStepBlocked(
  step: SignupStep,
  values: SignupValues,
  username: UsernameState,
): string | null {
  if (step === "email") return emailFieldError(values.email);
  if (step === "password") return passwordFieldError(values.password);
  if (step === "username") {
    const rule = usernameFieldError(values.username);
    if (rule) return rule;
    if (username === "taken") return TAKEN_USERNAME;
    if (username === "checking" || username === "idle") return "Checking that username…";
    return null;
  }
  if (values.displayName.trim().length > DISPLAY_NAME_MAX) return "Keep it under 50 characters.";
  return null;
}

/** The username fills the display name until they type their own. */
export function displayNameFor(input: { current: string; username: string; edited: boolean }): string {
  if (input.edited) return input.current;
  return normalizeUsername(input.username);
}

/** The step whose field caused a sign-up error, so the flow can jump back to it. */
export function stepForSignupError(message: string): SignupStep | null {
  const text = message.toLowerCase();
  if (message === TAKEN_USERNAME || text.includes("username")) return "username";
  if (text.includes("rate limit") || text.includes("check and try again")) return null;
  if (text.includes("password") || text.includes("at least 6 characters")) return "password";
  if (text.includes("email")) return "email";
  return null;
}

export type PasswordStrength = {
  level: "empty" | "short" | "okay" | "good" | "strong";
  label: string;
};

/** A plain hint under the password. Only the 6-character minimum is enforced. */
export function passwordStrength(password: string): PasswordStrength {
  if (password.length === 0) return { level: "empty", label: "At least 6 characters." };
  if (password.length < 6) return { level: "short", label: "Too short. Use at least 6 characters." };
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((pattern) => pattern.test(password)).length;
  if (password.length >= 12 && kinds >= 3) return { level: "strong", label: "Strong." };
  if (password.length >= 8 && kinds >= 2) return { level: "good", label: "Good." };
  return { level: "okay", label: "Okay. Longer is stronger." };
}

export type MailTarget = { href: string; label: string; external: boolean };

const WEBMAIL: { domains: string[]; href: string; label: string }[] = [
  { domains: ["gmail.com", "googlemail.com"], href: "https://mail.google.com/mail/u/0/#inbox", label: "Open Gmail" },
  {
    domains: ["outlook.com", "hotmail.com", "live.com", "msn.com"],
    href: "https://outlook.live.com/mail/0/inbox",
    label: "Open Outlook",
  },
  { domains: ["yahoo.com", "ymail.com"], href: "https://mail.yahoo.com/", label: "Open Yahoo Mail" },
  { domains: ["icloud.com", "me.com", "mac.com"], href: "https://www.icloud.com/mail", label: "Open iCloud Mail" },
];

function isIos(userAgent: string): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent);
}

/**
 * The Check your email button. iPhone opens Mail with message://, big
 * webmail providers open their inbox, and anything else gets mailto: as a
 * hint to open their mail app.
 */
export function openMailTarget(email: string, userAgent: string): MailTarget {
  if (isIos(userAgent)) return { href: "message://", label: "Open Mail", external: false };
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  const webmail = WEBMAIL.find((entry) => entry.domains.includes(domain));
  if (webmail) return { href: webmail.href, label: webmail.label, external: true };
  return { href: "mailto:", label: "Open your email app", external: false };
}

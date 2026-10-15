"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useSocial } from "@/components/social-provider";

export function AuthForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { ready, user, mode, signIn, signUp } = useSocial();
  const [tab, setTab] = useState<"login" | "signup">(
    params.get("tab") === "signup" ? "signup" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const result =
      tab === "login"
        ? await signIn(email, password)
        : await signUp({ email, password, username, displayName });
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.notice) {
      setMessage(result.notice);
      return;
    }
    router.push("/");
  }

  async function useDemo() {
    setBusy(true);
    setError(null);
    const result = await signIn("maya@cardflip.app", "demo1234");
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push("/");
  }

  if (!ready) {
    return <div className="mx-auto h-40 max-w-md animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/5" />;
  }

  if (user) {
    return (
      <div className="mx-auto max-w-md py-10 text-center">
        <p className="text-lg font-medium">You&apos;re in as @{user.username}</p>
        <Link href="/profile" className="mt-3 inline-block text-sm text-violet-700 dark:text-violet-300">
          Go to your profile
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold tracking-tight">
        {tab === "login" ? "Log in" : "Create your account"}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Follow collectors, post pulls, and keep your book.
      </p>

      <div className="mt-4 grid grid-cols-2 rounded-full bg-zinc-100 p-1 text-sm dark:bg-white/5">
        {(["login", "signup"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setTab(item);
              setError(null);
              setMessage(null);
            }}
            className={`rounded-full py-2 font-medium ${
              tab === item ? "bg-white shadow-sm dark:bg-zinc-800" : "text-zinc-500"
            }`}
          >
            {item === "login" ? "Log in" : "Sign up"}
          </button>
        ))}
      </div>

      <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-3">
        {tab === "signup" && (
          <>
            <Field label="Display name" value={displayName} onChange={setDisplayName} placeholder="Maya Chen" />
            <Field label="Username" value={username} onChange={setUsername} placeholder="waxroom" />
          </>
        )}
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@email.com" />
        <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 6 characters" />
        {error ? <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p> : null}
        {message ? <p className="text-sm text-zinc-600 dark:text-zinc-300">{message}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-zinc-900 py-3 text-sm font-semibold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-950"
        >
          {tab === "login" ? "Log in" : "Sign up"}
        </button>
      </form>

      {mode === "local" && (
        <div className="mt-5 rounded-2xl border border-dashed border-zinc-300 p-4 text-sm dark:border-white/15">
          <p className="font-medium">Try a demo collector</p>
          <p className="mt-1 text-zinc-500">maya@cardflip.app · demo1234</p>
          <p className="text-zinc-500">Also jordan@cardflip.app and sam@cardflip.app</p>
          <button
            type="button"
            onClick={() => void useDemo()}
            className="mt-3 rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-semibold dark:border-white/15"
          >
            Log in as Maya
          </button>
          <p className="mt-3 text-xs text-zinc-500">
            Accounts stay in this browser until Supabase keys are in .env.local.
          </p>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-zinc-500">{label}</span>
      <input
        required
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none dark:border-white/10 dark:bg-white/5"
      />
    </label>
  );
}

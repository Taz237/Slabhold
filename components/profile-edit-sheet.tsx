"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { solidButton } from "@/components/button-styles";
import { PhotoFileInputs } from "@/components/photo-file-inputs";
import { useSocial } from "@/components/social-provider";
import { PHOTO_HEIC_ERROR, PHOTO_READ_ERROR, readPhotoFile } from "@/lib/photos";
import { normalizeUsername } from "@/lib/social/local-db";
import type { Profile } from "@/lib/social/types";

export function ProfileEditSheet({
  profile,
  onClose,
  onSaved,
}: {
  profile: Profile;
  onClose: () => void;
  onSaved: (username: string) => void;
}) {
  const { updateProfile } = useSocial();
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  const [avatar, setAvatar] = useState<string | null>(profile.avatarDataUrl);
  const [cover, setCover] = useState<string | null>(profile.coverDataUrl);
  const [error, setError] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);
  const photoTarget = useRef<"avatar" | "cover">("avatar");
  const nameRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    nameRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = [...root.querySelectorAll<HTMLElement>("button, input, textarea")].filter(
        (element) => !element.hasAttribute("disabled"),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  function openAvatar() {
    photoTarget.current = "avatar";
    avatarInput.current?.click();
  }

  function openCover() {
    photoTarget.current = "cover";
    coverInput.current?.click();
  }

  function retryPhoto() {
    if (photoTarget.current === "cover") openCover();
    else openAvatar();
  }

  async function readImage(file: File | undefined, maxSize: number) {
    if (!file) return null;
    try {
      const dataUrl = await readPhotoFile(file, maxSize);
      setError(null);
      setPhotoFailed(false);
      return dataUrl;
    } catch (err) {
      setPhotoFailed(true);
      setError(err instanceof Error ? err.message : PHOTO_READ_ERROR);
      return null;
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setPhotoFailed(false);
    const username = normalizeUsername(handle);
    const result = await updateProfile({
      displayName,
      username,
      bio,
      avatarDataUrl: avatar,
      coverDataUrl: cover,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved(username);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-profile-title"
        onClick={(event) => event.stopPropagation()}
        className="mx-auto flex h-full w-full max-w-lg flex-col bg-[var(--background)] pt-[env(safe-area-inset-top)]"
      >
        <form onSubmit={(event) => void save(event)} className="flex min-h-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-2.5 dark:border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-2 py-1.5 text-sm font-medium text-zinc-500"
            >
              Cancel
            </button>
            <h2 id="edit-profile-title" className="text-[15px] font-bold">
              Edit profile
            </h2>
            <button type="submit" disabled={saving} className={solidButton}>
              {saving ? "Saving" : "Save"}
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="relative h-36 overflow-hidden bg-zinc-200 dark:bg-zinc-800">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cover} alt="" className="h-full w-full object-cover" />
              ) : (
                <div
                  className="h-full w-full"
                  style={{ background: `linear-gradient(115deg, ${profile.accent}, #18181b 72%)` }}
                />
              )}
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <button
                  type="button"
                  aria-label={cover ? "Change cover photo" : "Add cover photo"}
                  onClick={openCover}
                  className="inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {cover ? "Change cover" : "Add cover"}
                </button>
                {cover ? (
                  <button
                    type="button"
                    onClick={() => setCover(null)}
                    className="rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <PhotoFileInputs
                libraryRef={coverInput}
                onPick={async (file) => {
                  const next = await readImage(file, 960);
                  if (next) setCover(next);
                }}
              />
            </div>

            <div className="space-y-4 px-4 pt-0 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <div className="flex items-end justify-between">
                <button
                  type="button"
                  aria-label="Change profile picture"
                  onClick={openAvatar}
                  className="relative -mt-10 inline-block"
                >
                  <Avatar
                    name={displayName || profile.displayName}
                    image={avatar}
                    accent={profile.accent}
                    className="h-20 w-20 text-lg ring-4 ring-[var(--background)]"
                    expandable={false}
                  />
                  <span className="absolute right-0 bottom-0 grid h-7 w-7 place-items-center rounded-full bg-zinc-900 text-white ring-2 ring-[var(--background)] dark:bg-zinc-100 dark:text-zinc-950">
                    <Camera className="h-3.5 w-3.5" />
                  </span>
                </button>
                {avatar ? (
                  <button
                    type="button"
                    onClick={() => setAvatar(null)}
                    className="mb-1 text-xs font-medium text-zinc-500"
                  >
                    Remove photo
                  </button>
                ) : null}
                <PhotoFileInputs
                  libraryRef={avatarInput}
                  onPick={async (file) => {
                    const next = await readImage(file, 480);
                    if (next) setAvatar(next);
                  }}
                />
              </div>

              {error ? (
                <div role="alert" className="space-y-2">
                  <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
                  {photoFailed && error !== PHOTO_HEIC_ERROR ? (
                    <button
                      type="button"
                      onClick={retryPhoto}
                      className="inline-flex min-h-11 items-center text-sm font-semibold text-violet-700 dark:text-violet-300"
                    >
                      Try again
                    </button>
                  ) : null}
                </div>
              ) : null}

              <label className="block text-sm">
                <span className="mb-1.5 block text-zinc-500">Name</span>
                <input
                  ref={nameRef}
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="name"
                  maxLength={50}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-zinc-400 dark:border-white/10 dark:bg-white/5 dark:focus:border-white/30"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1.5 block text-zinc-500">Username</span>
                <div className="flex items-center rounded-xl border border-zinc-200 bg-white focus-within:border-zinc-400 dark:border-white/10 dark:bg-white/5 dark:focus-within:border-white/30">
                  <span className="pl-3 text-[15px] text-zinc-500">@</span>
                  <input
                    value={handle}
                    onChange={(event) =>
                      setHandle(event.target.value.replace(/^@+/, "").toLowerCase().slice(0, 20))
                    }
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    autoComplete="username"
                    className="min-w-0 flex-1 bg-transparent px-1 py-2.5 text-[15px] outline-none"
                  />
                </div>
                <span className="mt-1.5 block text-xs text-zinc-500">
                  3–20 characters. Letters, numbers, and underscores.
                </span>
              </label>

              <label className="block text-sm">
                <span className="mb-1.5 flex items-center justify-between text-zinc-500">
                  Bio
                  <span aria-hidden className="text-xs tabular-nums text-zinc-400">
                    {bio.length}/160
                  </span>
                </span>
                <textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value.slice(0, 160))}
                  rows={4}
                  className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[15px] leading-5 outline-none focus:border-zinc-400 dark:border-white/10 dark:bg-white/5 dark:focus:border-white/30"
                />
              </label>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useImperativeHandle, useRef, type Ref } from "react";
import { turnstileSiteKey } from "@/lib/auth/captcha";

export type CaptchaHandle = {
  reset: () => void;
};

export function Captcha({
  onToken,
  onExpire,
  ref,
}: {
  onToken: (token: string) => void;
  onExpire: () => void;
  ref?: Ref<CaptchaHandle>;
}) {
  const siteKey = turnstileSiteKey();
  const widget = useRef<TurnstileInstance>(null);

  useImperativeHandle(ref, () => ({
    reset() {
      widget.current?.reset();
    },
  }));

  if (!siteKey) return null;

  return (
    <Turnstile
      ref={widget}
      siteKey={siteKey}
      options={{ theme: "dark", size: "flexible" }}
      onSuccess={onToken}
      onExpire={() => {
        onExpire();
      }}
    />
  );
}

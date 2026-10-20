"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { turnstileSiteKey } from "@/lib/auth/captcha";

export type CaptchaHandle = {
  reset: () => void;
};

export function Captcha({
  onToken,
  onExpire,
  onFail,
  ref,
}: {
  onToken: (token: string) => void;
  onExpire: () => void;
  onFail: () => void;
  ref?: Ref<CaptchaHandle>;
}) {
  const siteKey = turnstileSiteKey();
  const widget = useRef<TurnstileInstance>(null);
  const onExpireRef = useRef(onExpire);

  useImperativeHandle(ref, () => ({
    reset() {
      widget.current?.reset();
    },
  }));

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    return () => {
      onExpireRef.current();
    };
  }, []);

  if (!siteKey) return null;

  return (
    <Turnstile
      ref={widget}
      siteKey={siteKey}
      options={{ theme: "dark", size: "flexible" }}
      scriptOptions={{ onError: onFail }}
      onSuccess={onToken}
      onExpire={() => {
        onExpire();
      }}
      onWidgetLoad={() => {
        onExpire();
      }}
      onBeforeInteractive={() => {
        onExpire();
      }}
      onError={() => {
        onExpire();
        onFail();
      }}
      onTimeout={() => {
        onExpire();
        onFail();
      }}
      onUnsupported={onFail}
    />
  );
}

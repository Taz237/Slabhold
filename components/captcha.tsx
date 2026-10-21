"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import {
  captchaOnActivity,
  captchaOnFail,
  captchaOnInteractive,
  captchaOnSilence,
  captchaOnToken,
  captchaWatchIdle,
  turnstileSiteKey,
} from "@/lib/auth/captcha";

export type CaptchaHandle = {
  reset: () => void;
};

export function Captcha({
  onToken,
  onExpire,
  onFail,
  onActivity,
  onInteractive,
  ref,
}: {
  onToken: (token: string) => void;
  onExpire: () => void;
  onFail: () => void;
  onActivity: () => void;
  onInteractive: (waiting: boolean) => void;
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
      options={{ theme: "light", size: "flexible" }}
      scriptOptions={{ onError: onFail }}
      onSuccess={onToken}
      onExpire={() => {
        onExpire();
      }}
      onWidgetLoad={() => {
        onExpire();
        onActivity();
      }}
      onBeforeInteractive={() => {
        onExpire();
        onInteractive(true);
      }}
      onAfterInteractive={() => {
        onInteractive(false);
      }}
      onError={() => {
        onExpire();
        onFail();
      }}
      onTimeout={() => {
        onExpire();
      }}
      onUnsupported={onFail}
    />
  );
}

/** 15s with no widget activity shows a load failure. An interactive check pauses that timer. */
export function useCaptchaWatch(enabled: boolean, token: string | null) {
  const [watch, setWatch] = useState(captchaWatchIdle);

  useEffect(() => {
    if (!enabled || token || !watch.armed) return;
    const timer = window.setTimeout(() => {
      setWatch((current) => captchaOnSilence(current));
    }, 15_000);
    return () => window.clearTimeout(timer);
  }, [enabled, token, watch.armed]);

  const onActivity = useCallback(() => {
    setWatch((current) => captchaOnActivity(current));
  }, []);
  const onInteractive = useCallback((waiting: boolean) => {
    setWatch((current) => captchaOnInteractive(current, waiting));
  }, []);
  const onSolved = useCallback(() => {
    setWatch(() => captchaOnToken());
  }, []);
  const onFail = useCallback(() => {
    setWatch(() => captchaOnFail());
  }, []);

  return {
    failed: watch.failed,
    onActivity,
    onInteractive,
    onSolved,
    onFail,
  };
}

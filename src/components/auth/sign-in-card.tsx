"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { signIn } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { shouldUseExternalGoogleAuth } from "@/lib/auth-client";

export function SignInCard() {
  const [isPending, setIsPending] = useState(false);
  const [showBrowserHint, setShowBrowserHint] = useState(false);

  async function handleGoogleSignIn() {
    if (isPending) {
      return;
    }

    setIsPending(true);
    setShowBrowserHint(false);

    try {
      const useExternalBrowser = shouldUseExternalGoogleAuth({
        matchMedia: window.matchMedia.bind(window),
        navigatorStandalone: "standalone" in navigator ? Boolean(navigator.standalone) : false,
      });

      if (!useExternalBrowser) {
        await signIn("google");
        return;
      }

      const response = await signIn("google", {
        callbackUrl: "/",
        redirect: false,
      });

      if (!response?.url) {
        throw new Error("Missing Google sign-in URL");
      }

      const popup = window.open(response.url, "_blank", "noopener,noreferrer");

      if (!popup) {
        throw new Error("Browser handoff blocked");
      }

      setShowBrowserHint(true);
    } catch {
      setShowBrowserHint(true);
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="w-full max-w-sm space-y-3">
      <Button className="w-full justify-center" size="lg" onClick={handleGoogleSignIn} disabled={isPending}>
        <KeyRound className="size-4" />
        {isPending ? "Opening Google…" : "Continue With Google"}
      </Button>
      {showBrowserHint ? (
        <p className="text-center text-xs leading-5 text-[color:var(--muted)]">
          Google sign-in must finish in your browser when SealNote is running as an installed app.
          Complete sign-in in the browser window that opened, then return here.
        </p>
      ) : null}
    </div>
  );
}

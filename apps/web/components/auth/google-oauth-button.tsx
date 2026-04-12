"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createBrowserClient } from "@/lib/supabase/client";

export function GoogleOAuthButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (oauthError) {
        console.error("[auth:oauth]", oauthError);
        setError(
          "Anmeldung mit Google fehlgeschlagen. Bitte versuche es erneut.",
        );
        setLoading(false);
      }
    } catch (err) {
      console.error("[auth:oauth]", err);
      setError("Anmeldung mit Google fehlgeschlagen. Bitte versuche es erneut.");
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={handleClick}
        disabled={loading}
        aria-label="Mit Google fortfahren"
        className="w-full"
      >
        <GoogleGlyph />
        Mit Google fortfahren
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#EA4335"
        d="M12 10.2v3.92h5.45c-.24 1.4-1.64 4.1-5.45 4.1-3.28 0-5.96-2.72-5.96-6.07s2.68-6.07 5.96-6.07c1.87 0 3.12.8 3.84 1.48l2.62-2.52C16.85 3.51 14.65 2.5 12 2.5 6.98 2.5 2.9 6.58 2.9 11.6s4.08 9.1 9.1 9.1c5.25 0 8.73-3.69 8.73-8.88 0-.6-.07-1.06-.15-1.52H12z"
      />
      <path
        fill="#4285F4"
        d="M21.58 12.22c0-.6-.05-1.04-.14-1.52H12v3.08h5.45c-.11.73-.71 1.85-2.04 2.6l-.02.12 2.96 2.3.21.02c1.88-1.73 2.99-4.27 2.99-7.6z"
      />
      <path
        fill="#FBBC05"
        d="M6.04 13.38c-.17-.5-.27-1.04-.27-1.58s.1-1.08.26-1.58l-.01-.12-3.05-2.37-.1.05A9.1 9.1 0 0 0 1.9 11.8a9.1 9.1 0 0 0 .97 4.02l3.17-2.44z"
      />
      <path
        fill="#34A853"
        d="M12 5.58c2.08 0 3.48.9 4.28 1.65l3.12-3.05C17.54 2.5 14.9 1.5 12 1.5a10.1 10.1 0 0 0-9.07 5.58l3.08 2.39c.74-2.2 2.85-3.89 5.99-3.89z"
      />
    </svg>
  );
}

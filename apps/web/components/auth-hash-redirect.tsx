"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Supabase's implicit-flow failures arrive as `#error=…&error_code=…`, which the server
 * never sees. Read the fragment once and hand off to the sign-in page's banner.
 */
export function AuthHashRedirect() {
  const router = useRouter();
  useEffect(() => {
    const errorCode = new URLSearchParams(window.location.hash.slice(1)).get("error_code");
    if (errorCode) {
      router.replace(`/sign-in?error=${errorCode === "otp_expired" ? "link_expired" : "link_invalid"}`);
    }
  }, [router]);
  return null;
}

import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const DEFAULT_NEXT = "/onboarding?verified=1";

/** Same-origin relative paths only — blocks `//host` and absolute-URL open redirects. */
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : DEFAULT_NEXT;
}

/**
 * Handles the OAuth / email-confirmation / password-recovery redirect.
 * Supports both link shapes Supabase email templates can produce:
 * - `?code=...` (PKCE) — exchanged via exchangeCodeForSession.
 * - `?token_hash=...&type=...` (the `{{ .TokenHash }}` template variable) — verified
 *   via verifyOtp. This shape also works when the link is opened in a different
 *   browser than the one that requested it, since it needs no code_verifier cookie.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"));

  const supabase = createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    // Link opened in another browser/app: Supabase already confirmed the email before
    // redirecting here, there's just no verifier cookie to mint a session with.
    if (error.name === "AuthPKCECodeVerifierMissingError" || error.code === "pkce_code_verifier_not_found") {
      return NextResponse.redirect(`${origin}/sign-in?verified=1`);
    }
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/sign-in?error=link_invalid`);
}

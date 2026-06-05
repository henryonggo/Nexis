import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@nexis/types";

/**
 * Refreshes the Supabase session on every request and guards protected routes.
 * Unauthenticated users hitting app/onboarding routes are redirected to sign-in.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: any[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute =
    path.startsWith("/sign-in") ||
    path.startsWith("/sign-up") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password") ||
    path.startsWith("/auth");
  const isProtected =
    path.startsWith("/dashboard") ||
    path.startsWith("/onboarding") ||
    path.startsWith("/account") ||
    path.startsWith("/attendance") ||
    path.startsWith("/employees") ||
    path.startsWith("/leave") ||
    path.startsWith("/claims") ||
    path.startsWith("/loans") ||
    path.startsWith("/payroll") ||
    path.startsWith("/performance") ||
    path.startsWith("/reports") ||
    path.startsWith("/billing") ||
    path.startsWith("/analytics") ||
    path.startsWith("/audit") ||
    path.startsWith("/developer") ||
    path.startsWith("/members");

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.searchParams.set("redirectTo", path);
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute && !path.startsWith("/auth")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

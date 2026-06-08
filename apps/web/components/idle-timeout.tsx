"use client";

import { useEffect, useRef } from "react";
import { signOutIdle } from "@/app/(auth)/actions";

const IDLE_LIMIT_MS = 2 * 60 * 60 * 1000; // 2 hours

const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;

/**
 * Signs the user out after IDLE_LIMIT_MS of no activity (security best practice
 * for shared/unattended devices). The server session lifetime in Supabase is the
 * real boundary; this is the UX layer that ends the session on the client.
 */
export function IdleTimeout() {
  const lastActivity = useRef(Date.now());
  const signedOut = useRef(false);

  useEffect(() => {
    function end() {
      if (signedOut.current) return;
      signedOut.current = true;
      // Clears the session server-side and redirects to /sign-in?timeout=1.
      void signOutIdle();
    }

    function mark() {
      lastActivity.current = Date.now();
    }

    function check() {
      if (Date.now() - lastActivity.current >= IDLE_LIMIT_MS) end();
    }

    function onVisible() {
      // A tab returning from the background may have crossed the idle window.
      if (document.visibilityState === "visible") check();
      else mark();
    }

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(check, 60 * 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, mark));
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, []);

  return null;
}

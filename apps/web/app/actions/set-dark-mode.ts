"use server";

import { cookies } from "next/headers";

type DarkMode = "light" | "dark" | "system";

export async function setDarkMode(mode: DarkMode) {
  const cookieStore = await cookies();
  cookieStore.set("nexis-mode", mode, {
    maxAge: 365 * 24 * 60 * 60, // 1 year
    path: "/",
    sameSite: "lax",
    httpOnly: false, // Accessible to client for immediate class update
  });
}

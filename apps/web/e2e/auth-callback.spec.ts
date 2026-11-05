import { test, expect } from "@playwright/test";

/**
 * Auth callback hardening. Unauthenticated — no fixtures. A bogus `code` has no PKCE
 * verifier cookie, so exchangeCodeForSession fails locally (no network) with the
 * missing-verifier error, which the callback treats as "email already confirmed".
 */
const VERIFIED = "Email Anda sudah terverifikasi";
const EXPIRED = "Tautan verifikasi sudah kedaluwarsa";

test.describe("auth callback", () => {
  test("stray ?code on the landing page is forwarded to the callback and ends on sign-in, verified", async ({ page }) => {
    await page.goto("/?code=bogus");
    await expect(page).toHaveURL(/\/sign-in\?verified=1$/);
    await expect(page.getByText(VERIFIED)).toBeVisible();
  });

  test("Supabase failure redirect (?error_code=otp_expired) shows the expired message", async ({ page }) => {
    await page.goto("/?error=access_denied&error_code=otp_expired&error_description=x");
    await expect(page).toHaveURL(/\/sign-in\?error=link_expired$/);
    await expect(page.getByText(EXPIRED)).toBeVisible();
  });

  test("other failure codes show the invalid-link message", async ({ page }) => {
    await page.goto("/?error=access_denied&error_code=bad&error_description=x");
    await expect(page).toHaveURL(/\/sign-in\?error=link_invalid$/);
    await expect(page.getByText("Tautan tidak valid atau sudah dipakai")).toBeVisible();
  });

  test("hash-fragment error on sign-in shows the expired message", async ({ page }) => {
    await page.goto("/sign-in#error=access_denied&error_code=otp_expired");
    await expect(page).toHaveURL(/\/sign-in\?error=link_expired$/);
    await expect(page.getByText(EXPIRED)).toBeVisible();
  });

  test("hash-fragment error on the landing page is forwarded to sign-in", async ({ page }) => {
    await page.goto("/#error=access_denied&error_code=otp_expired");
    await expect(page).toHaveURL(/\/sign-in\?error=link_expired$/);
    await expect(page.getByText(EXPIRED)).toBeVisible();
  });

  test("a protocol-relative next never redirects off-origin", async ({ page, baseURL }) => {
    await page.goto("/auth/callback?code=x&next=//evil.example");
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
    await expect(page).toHaveURL(/\/sign-in\?verified=1$/);
  });

  test("sign-in ?verified=1 shows the notice", async ({ page }) => {
    await page.goto("/sign-in?verified=1");
    await expect(page.getByText(VERIFIED)).toBeVisible();
  });
});

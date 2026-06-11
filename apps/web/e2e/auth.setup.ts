import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { STORAGE_STATE } from "./_auth";

/**
 * Produces the signed-in admin session that the happy-path specs reuse via
 * `storageState`. Runs first (as a Playwright "setup" project dependency).
 *
 * Provide a seeded admin's credentials via env:
 *   E2E_EMAIL=...  E2E_PASSWORD=...
 * (the account must already exist with a company + employees in the target DB —
 * seeding is Antigravity's lane). When they're absent this step skips, and the
 * authenticated specs skip in turn, so the guard tests still run unattended.
 *
 * Selectors are locale-independent (ids / submit role) so this works regardless
 * of the active NEXIS_LOCALE.
 */
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

setup("authenticate admin", async ({ page }) => {
  setup.skip(!email || !password, "set E2E_EMAIL + E2E_PASSWORD to generate a signed-in session");

  await page.goto("/sign-in");
  await page.locator("#email").fill(email!);
  await page.locator("#password").fill(password!);
  await page.locator('button[type="submit"]').click();

  // A successful sign-in lands on the dashboard (or onboarding for a brand-new
  // account with no company yet — either means the session cookie is set).
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/sign-in/);

  fs.mkdirSync(path.dirname(STORAGE_STATE), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE });
});

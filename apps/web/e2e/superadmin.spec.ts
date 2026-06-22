import { test, expect } from "@playwright/test";

/**
 * Platform superadmin free-pass surface e2e.
 *
 * The surface is gated two ways: unauthenticated users are bounced to sign-in by
 * the app layout, and authenticated non-superadmins get a 404 (notFound) since
 * superadmin membership is an email allowlist, not a DB role. The unauthenticated
 * guard runs everywhere with no seeded data. A full grant/revoke happy path needs
 * a signed-in superadmin session + service-role key, so it isn't covered here.
 */

test.describe("superadmin — access guard", () => {
  test("unauthenticated visit to /superadmin redirects to sign-in", async ({ page }) => {
    await page.goto("/superadmin");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

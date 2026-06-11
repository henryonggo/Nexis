import { test, expect } from "@playwright/test";
import { STORAGE_STATE, HAS_AUTH } from "./_auth";

/**
 * Stage 7 — audit & compliance center e2e.
 *
 * Guard test runs everywhere (no seeded data). The dashboard test needs an
 * authenticated owner/admin session via E2E_STORAGE_STATE; when unset it is
 * skipped rather than failing on missing fixtures (same pattern as the other specs).
 */

const storageState = STORAGE_STATE;
const hasAuth = HAS_AUTH;

test.describe("audit — auth guard", () => {
  test("unauthenticated visit to /audit redirects to sign-in", async ({ page }) => {
    await page.goto("/audit");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("audit — admin center", () => {
  test.skip(!hasAuth, "set E2E_STORAGE_STATE to a signed-in owner/admin session to run");
  test.use({ storageState });

  test("admin can open the audit center and filter by entity", async ({ page }) => {
    await page.goto("/audit");
    await expect(page.getByRole("heading", { name: "Audit & Kepatuhan" })).toBeVisible();
    await page.locator('a[href="/audit?entity=leave_requests"]').click();
    await expect(page).toHaveURL(/entity=leave_requests/);
  });
});

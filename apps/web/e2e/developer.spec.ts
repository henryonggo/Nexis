import { test, expect } from "@playwright/test";
import { STORAGE_STATE, HAS_AUTH } from "./_auth";

/**
 * Stage 7 — public API & webhooks (developer surface) e2e.
 *
 * Guard test runs everywhere. The owner/admin happy-path needs an authenticated
 * session via E2E_STORAGE_STATE; skipped when unset (same pattern as other specs).
 */

const storageState = STORAGE_STATE;
const hasAuth = HAS_AUTH;

test.describe("developer — auth guard", () => {
  test("unauthenticated visit to /developer redirects to sign-in", async ({ page }) => {
    await page.goto("/developer");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("developer — API & webhook dashboard", () => {
  test.skip(!hasAuth, "set E2E_STORAGE_STATE to a signed-in owner/admin session to run");
  test.use({ storageState });

  test("owner can open the developer dashboard", async ({ page }) => {
    await page.goto("/developer");
    await expect(page.getByRole("heading", { name: "API & Webhook" })).toBeVisible();
    await expect(page.getByText("Buat API key")).toBeVisible();
    await expect(page.getByText("Tambah webhook")).toBeVisible();
  });
});

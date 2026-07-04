import { test, expect } from "@playwright/test";
import { STORAGE_STATE, HAS_AUTH } from "./_auth";

/**
 * Pivot Phase 1 — agent approval queue e2e (the approval gate,
 * docs/pivot/PIVOT-PHASE-1.md). Guard test runs everywhere; the admin path
 * needs an authenticated owner/admin session via E2E_STORAGE_STATE and is
 * skipped when unset (same convention as the other specs).
 */

const storageState = STORAGE_STATE;
const hasAuth = HAS_AUTH;

test.describe("approvals — auth guard", () => {
  test("unauthenticated visit to /approvals redirects to sign-in", async ({ page }) => {
    await page.goto("/approvals");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("approvals — admin queue", () => {
  test.skip(!hasAuth, "set E2E_STORAGE_STATE to a signed-in owner/admin session to run");
  test.use({ storageState });

  test("admin can open the approval queue", async ({ page }) => {
    await page.goto("/approvals");
    await expect(page.getByRole("heading", { name: "Persetujuan Agen" })).toBeVisible();
    await expect(page.getByText("Menunggu persetujuan")).toBeVisible();
  });
});

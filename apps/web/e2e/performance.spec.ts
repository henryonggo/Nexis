import { test, expect } from "@playwright/test";
import { STORAGE_STATE, HAS_AUTH } from "./_auth";

/**
 * Stage 7 — performance & KPI e2e.
 *
 * Guard test runs everywhere (no seeded data). The manager happy-path needs an
 * authenticated session via E2E_STORAGE_STATE; skipped when unset (same pattern
 * as payroll/loans specs).
 */

const storageState = STORAGE_STATE;
const hasAuth = HAS_AUTH;

test.describe("performance — auth guard", () => {
  test("unauthenticated visit to /performance redirects to sign-in", async ({ page }) => {
    await page.goto("/performance");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("performance — manager dashboard", () => {
  test.skip(!hasAuth, "set E2E_STORAGE_STATE to a signed-in manager/admin session to run");
  test.use({ storageState });

  test("manager can open the performance dashboard", async ({ page }) => {
    await page.goto("/performance");
    await expect(page.getByRole("heading", { name: "Kinerja & KPI" })).toBeVisible();
    await expect(page.getByText("Buat siklus penilaian")).toBeVisible();
  });
});

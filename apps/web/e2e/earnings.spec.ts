import { test, expect } from "@playwright/test";
import { STORAGE_STATE, HAS_AUTH } from "./_auth";

/**
 * Configurable salary earnings (allowances) e2e — mirror of deductions.spec.ts.
 *
 * The auth guard runs everywhere (no seeded data needed). The owner/admin happy
 * path needs an authenticated session via E2E_STORAGE_STATE; when unset it is
 * skipped. NOTE: until Antigravity lands the earning_* schema + new compensation
 * columns, writes through the page will no-op against missing tables — the smoke
 * test only asserts the config surface renders and is reachable by an owner/admin.
 */

const storageState = STORAGE_STATE;
const hasAuth = HAS_AUTH;

test.describe("earnings — auth guard", () => {
  test("unauthenticated visit to /earnings redirects to sign-in", async ({ page }) => {
    await page.goto("/earnings");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("earnings — owner/admin config", () => {
  test.skip(!hasAuth, "set E2E_STORAGE_STATE to a signed-in owner/admin session to run");
  test.use({ storageState });

  test("owner can open the allowances config page", async ({ page }) => {
    await page.goto("/earnings");
    await expect(page.getByRole("heading", { name: "Tunjangan & rincian gaji" })).toBeVisible();
    // The "add an allowance" and "create a group" surfaces are present.
    await expect(page.getByText("Tambah tunjangan")).toBeVisible();
    await expect(page.getByText("Buat grup")).toBeVisible();
  });

  test("an employee page exposes the per-person allowance picker", async ({ page }) => {
    await page.goto("/employees");
    const firstEmployee = page.getByRole("link").filter({ hasText: /.+/ }).first();
    await firstEmployee.click();
    // The allowances card with group/manual modes is rendered.
    await expect(page.getByRole("heading", { name: "Tunjangan" }).first()).toBeVisible();
    await expect(page.getByText("Pilih manual").first()).toBeVisible();
  });
});

import { test, expect } from "@playwright/test";
import { STORAGE_STATE, HAS_AUTH } from "./_auth";

/**
 * Configurable salary deductions e2e.
 *
 * The auth guard runs everywhere (no seeded data needed). The owner/admin happy
 * path needs an authenticated session via E2E_STORAGE_STATE; when unset it is
 * skipped. NOTE: until Antigravity lands the deduction_* schema, writes through
 * the page will no-op against missing tables — the smoke test only asserts the
 * config surface renders and is reachable by an owner/admin.
 */

const storageState = STORAGE_STATE;
const hasAuth = HAS_AUTH;

test.describe("deductions — auth guard", () => {
  test("unauthenticated visit to /deductions redirects to sign-in", async ({ page }) => {
    await page.goto("/deductions");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("deductions — owner/admin config", () => {
  test.skip(!hasAuth, "set E2E_STORAGE_STATE to a signed-in owner/admin session to run");
  test.use({ storageState });

  test("owner can open the deductions config page", async ({ page }) => {
    await page.goto("/deductions");
    await expect(page.getByRole("heading", { name: "Potongan gaji" })).toBeVisible();
    // The "add a custom deduction" and "create a group" surfaces are present.
    await expect(page.getByText("Tambah potongan kustom")).toBeVisible();
    await expect(page.getByText("Buat grup")).toBeVisible();
  });

  test("an employee page exposes the per-person deduction picker", async ({ page }) => {
    await page.goto("/employees");
    const firstEmployee = page.getByRole("link").filter({ hasText: /.+/ }).first();
    await firstEmployee.click();
    // The deductions card with group/manual modes is rendered.
    await expect(page.getByRole("heading", { name: "Potongan gaji" })).toBeVisible();
    await expect(page.getByText("Pilih manual")).toBeVisible();
  });
});

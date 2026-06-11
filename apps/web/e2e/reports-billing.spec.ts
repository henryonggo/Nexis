import { test, expect } from "@playwright/test";
import { STORAGE_STATE, HAS_AUTH } from "./_auth";

/**
 * Stage 6 — reports & billing e2e.
 *
 * Guard tests run everywhere (no seeded data). The dashboard tests need an
 * authenticated owner/admin session via E2E_STORAGE_STATE; when unset they are
 * skipped rather than failing on missing fixtures (same pattern as payroll.spec).
 */

const storageState = STORAGE_STATE;
const hasAuth = HAS_AUTH;

test.describe("reports & billing — auth guard", () => {
  test("unauthenticated visit to /reports redirects to sign-in", async ({ page }) => {
    await page.goto("/reports");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("unauthenticated visit to /billing redirects to sign-in", async ({ page }) => {
    await page.goto("/billing");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("reports & billing — admin dashboards", () => {
  test.skip(!hasAuth, "set E2E_STORAGE_STATE to a signed-in owner/admin session to run");
  test.use({ storageState });

  test("admin can open the reports page and see the generate form", async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Laporan & Ekspor" })).toBeVisible();
    await expect(page.getByText("Riwayat laporan")).toBeVisible();
  });

  test("admin can open the billing page and see the current plan", async ({ page }) => {
    await page.goto("/billing");
    await expect(page.getByRole("heading", { name: "Tagihan & Paket" })).toBeVisible();
    await expect(page.getByText("Paket saat ini")).toBeVisible();
    await expect(page.getByText("Karyawan aktif")).toBeVisible();
  });
});

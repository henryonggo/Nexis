import { test, expect } from "@playwright/test";
import fs from "node:fs";

/**
 * Stage 7 — analytics dashboard e2e.
 *
 * Guard test runs everywhere (no seeded data). The dashboard test needs an
 * authenticated owner/admin session via E2E_STORAGE_STATE; when unset it is
 * skipped rather than failing on missing fixtures (same pattern as the other specs).
 */

const storageState = process.env.E2E_STORAGE_STATE;
const hasAuth = !!storageState && fs.existsSync(storageState);

test.describe("analytics — auth guard", () => {
  test("unauthenticated visit to /analytics redirects to sign-in", async ({ page }) => {
    await page.goto("/analytics");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("analytics — admin dashboard", () => {
  test.skip(!hasAuth, "set E2E_STORAGE_STATE to a signed-in owner/admin session to run");
  test.use({ storageState });

  test("admin can open the analytics dashboard", async ({ page }) => {
    await page.goto("/analytics");
    await expect(page.getByRole("heading", { name: "Analitik" })).toBeVisible();
    await expect(page.getByText("Karyawan aktif")).toBeVisible();
    await expect(page.getByText("Tren bruto payroll")).toBeVisible();
  });
});

import { test, expect } from "@playwright/test";
import fs from "node:fs";

/**
 * Stage 5 — leave & claims e2e.
 *
 * Guard tests run everywhere (no seeded data). The happy-path approval test needs
 * an authenticated manager/admin session via E2E_STORAGE_STATE; when unset it is
 * skipped rather than failing on missing fixtures (same pattern as payroll.spec).
 */

const storageState = process.env.E2E_STORAGE_STATE;
const hasAuth = !!storageState && fs.existsSync(storageState);

test.describe("leave & claims — auth guard", () => {
  test("unauthenticated visit to /leave redirects to sign-in", async ({ page }) => {
    await page.goto("/leave");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("unauthenticated visit to /claims redirects to sign-in", async ({ page }) => {
    await page.goto("/claims");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("leave & claims — approval dashboards", () => {
  test.skip(!hasAuth, "set E2E_STORAGE_STATE to a signed-in manager/admin session to run");
  test.use({ storageState });

  test("manager can open the leave approval dashboard", async ({ page }) => {
    await page.goto("/leave");
    await expect(page.getByRole("heading", { name: "Cuti" })).toBeVisible();
    await expect(page.getByText("Menunggu persetujuan")).toBeVisible();
  });

  test("manager can open the claims approval dashboard", async ({ page }) => {
    await page.goto("/claims");
    await expect(page.getByRole("heading", { name: "Klaim Reimbursement" })).toBeVisible();
    await expect(page.getByText("Menunggu persetujuan")).toBeVisible();
  });
});

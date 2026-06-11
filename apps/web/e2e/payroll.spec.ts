import { test, expect } from "@playwright/test";
import { STORAGE_STATE, HAS_AUTH } from "./_auth";

/**
 * Stage 4 — payroll e2e.
 *
 * Guard test runs everywhere (no seeded data needed). The happy-path test needs
 * an authenticated admin session via E2E_STORAGE_STATE (a Playwright storageState
 * JSON from a signed-in seeded admin). When it isn't set, the happy path is
 * skipped rather than failing on missing fixtures.
 */

const storageState = STORAGE_STATE;
const hasAuth = HAS_AUTH;

test.describe("payroll — auth guard", () => {
  test("unauthenticated visit to /payroll redirects to sign-in", async ({ page }) => {
    await page.goto("/payroll");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("unauthenticated visit to /payroll/new redirects to sign-in", async ({ page }) => {
    await page.goto("/payroll/new");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("payroll — run wizard happy path", () => {
  test.skip(!hasAuth, "set E2E_STORAGE_STATE to a signed-in admin session to run");
  test.use({ storageState });

  test("admin can start a draft run and approve it", async ({ page }) => {
    await page.goto("/payroll");
    await expect(page.getByRole("heading", { name: "Penggajian" })).toBeVisible();

    // Launch the run wizard.
    await page.getByRole("link", { name: "Jalankan payroll" }).click();
    await expect(page.getByRole("heading", { name: "Jalankan payroll" })).toBeVisible();

    // Submit the prefilled (previous-month, monthly) draft run. This is a server
    // action that computes a preview, writes the draft, and redirects to the
    // review screen — allow generous time for the action + redirect + data load.
    await page.getByRole("button", { name: "Buat draf run" }).click();
    await page.waitForURL(/\/payroll\/[0-9a-f-]{36}$/, { timeout: 30000 });

    // Lands on the review screen with the per-employee breakdown and summary.
    await expect(page.getByRole("heading", { name: /^Payroll / })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Neto (take-home)")).toBeVisible();

    // Approve & process — the money-flow action. Moves the run draft → queued
    // (the worker finishes the calculation/payslips asynchronously). We assert the
    // queued state surfaces, which proves the approve action committed.
    await page.getByRole("button", { name: "Setujui & proses" }).click();
    await expect(page.getByText(/Antre|Diproses|Selesai/)).toBeVisible({ timeout: 30000 });
    // The approve control is gone once the run leaves draft.
    await expect(page.getByRole("button", { name: "Setujui & proses" })).toHaveCount(0);
  });
});

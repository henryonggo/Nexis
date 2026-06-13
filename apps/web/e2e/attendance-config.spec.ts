import { test, expect } from "@playwright/test";
import { STORAGE_STATE, HAS_AUTH } from "./_auth";

/**
 * Case-02 G6 — attendance configuration UI e2e.
 *
 * Guard test runs everywhere. The happy path needs an authenticated owner/admin
 * session via E2E_STORAGE_STATE; skipped when unset (same convention as
 * attendance.spec.ts).
 */

const storageState = STORAGE_STATE;
const hasAuth = HAS_AUTH;

test.describe("attendance config — auth guard", () => {
  test("unauthenticated visit to /attendance/config redirects to sign-in", async ({ page }) => {
    await page.goto("/attendance/config");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("attendance config — admin happy path", () => {
  test.skip(!hasAuth, "set E2E_STORAGE_STATE to a signed-in admin session to run");
  test.use({ storageState });

  test("admin reaches config from the board and can switch tabs", async ({ page }) => {
    await page.goto("/attendance");
    await page.getByRole("link", { name: "Pengaturan" }).click();

    await expect(page).toHaveURL(/\/attendance\/config/);
    await expect(page.getByRole("heading", { name: "Pengaturan Kehadiran" })).toBeVisible();

    // Geofence add form is the default tab.
    await expect(page.getByRole("button", { name: "Tambah lokasi" })).toBeVisible();

    // Tabs switch to the shift surface.
    await page.getByRole("tab", { name: "Shift" }).click();
    await expect(page.getByRole("button", { name: "Tambah shift" })).toBeVisible();

    // Holiday seed is present but disabled until the seed RPC lands (G6 handoff).
    await page.getByRole("tab", { name: "Hari Libur" }).click();
    await expect(page.getByRole("button", { name: /Isi libur/ })).toBeDisabled();
  });
});

import { test, expect } from "@playwright/test";
import { STORAGE_STATE, HAS_AUTH } from "./_auth";

/**
 * Nexis Lite — admin dashboard "what do I do next" card + the single grouped
 * sidebar. Guard runs everywhere; the admin path needs an owner/admin session
 * (see auth.setup.ts) and skips when none exists. Which side of the next-action
 * card renders depends on whether approval_requests are pending, so the
 * assertion accepts either state.
 */

const storageState = STORAGE_STATE;
const hasAuth = HAS_AUTH;

test.describe("dashboard — auth guard", () => {
  test("unauthenticated visit to /dashboard redirects to sign-in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("dashboard — admin", () => {
  test.skip(!hasAuth, "set E2E_EMAIL/E2E_PASSWORD or E2E_STORAGE_STATE to run");
  test.use({ storageState });

  test("next-action card points to /approvals", async ({ page }) => {
    await page.goto("/dashboard");

    const pending = page.getByText(/persetujuan menunggu keputusan Anda$/);
    if (await pending.count()) {
      await expect(page.getByRole("link", { name: "Tinjau persetujuan" })).toHaveAttribute(
        "href",
        "/approvals",
      );
    } else {
      await expect(page.getByText("Semua beres")).toBeVisible();
      await expect(page.getByRole("link", { name: "Jalankan agen penggajian" })).toHaveAttribute(
        "href",
        "/approvals",
      );
    }
  });

  test("sidebar lists every reachable item in labelled groups", async ({ page }) => {
    await page.goto("/dashboard");
    const sidebar = page.locator("aside");

    for (const group of ["Tim", "Gaji", "Perusahaan"]) {
      await expect(sidebar.getByText(group, { exact: true })).toBeVisible();
    }
    for (const item of ["Dashboard", "Persetujuan", "Penggajian", "Karyawan", "Slip Gaji", "Tagihan", "Pengaturan"]) {
      await expect(sidebar.getByRole("link", { name: item, exact: true })).toBeVisible();
    }

    // Removed pre-pivot surfaces and the pillar/Glance chrome are gone.
    for (const gone of ["Kinerja", "Analitik", "API"]) {
      await expect(sidebar.getByRole("link", { name: gone, exact: true })).toHaveCount(0);
    }
    await expect(page.getByRole("link", { name: /Glance/ })).toHaveCount(0);
  });
});

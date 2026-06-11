import { test, expect } from "@playwright/test";
import { STORAGE_STATE, HAS_AUTH } from "./_auth";

/**
 * Stage 5 — leave & claims e2e.
 *
 * Guard tests run everywhere (no seeded data). The happy-path approval test needs
 * an authenticated manager/admin session via E2E_STORAGE_STATE; when unset it is
 * skipped rather than failing on missing fixtures (same pattern as payroll.spec).
 */

const storageState = STORAGE_STATE;
const hasAuth = HAS_AUTH;

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

  // Money-flow: approve a pending leave request when one is seeded; otherwise
  // verify the empty state. Either branch passes, so the test is robust whether
  // or not the target DB has pending fixtures (seeding is Antigravity's lane).
  test("manager can approve a pending leave request (when seeded)", async ({ page }) => {
    await page.goto("/leave");
    await expect(page.getByRole("heading", { name: "Cuti" })).toBeVisible();

    const approve = page.getByRole("button", { name: "Setujui" }).first();
    if (await approve.count()) {
      await approve.click();
      // The server action approves + revalidates; the approved row leaves the
      // pending queue, so that approve control disappears.
      await expect(approve).toHaveCount(0, { timeout: 15000 });
    } else {
      await expect(page.getByText("Tidak ada permintaan cuti yang menunggu.")).toBeVisible();
    }
  });
});

import { test, expect } from "@playwright/test";
import { STORAGE_STATE, HAS_AUTH } from "./_auth";

/**
 * Stage 7 — loans & advances (kasbon) e2e.
 *
 * Guard test runs everywhere (no seeded data). The dashboard test needs an
 * authenticated owner/admin session via E2E_STORAGE_STATE; when unset it is
 * skipped. NOTE: until Antigravity lands the employee_loans schema, the authed
 * test will surface an empty queue rather than seeded data.
 */

const storageState = STORAGE_STATE;
const hasAuth = HAS_AUTH;

test.describe("loans — auth guard", () => {
  test("unauthenticated visit to /loans redirects to sign-in", async ({ page }) => {
    await page.goto("/loans");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("loans — admin queue", () => {
  test.skip(!hasAuth, "set E2E_STORAGE_STATE to a signed-in owner/admin/manager session to run");
  test.use({ storageState });

  test("manager can open the loans page", async ({ page }) => {
    await page.goto("/loans");
    await expect(page.getByRole("heading", { name: "Pinjaman & Kasbon" })).toBeVisible();
    await expect(page.getByText("Menunggu persetujuan")).toBeVisible();
  });
});

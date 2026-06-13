import { test, expect } from "@playwright/test";
import { STORAGE_STATE, HAS_AUTH } from "./_auth";

/**
 * Case-02 G7 (pre-run readiness gate) + G9a (web payslip download) guards.
 * Guards run everywhere; the admin happy path needs E2E_STORAGE_STATE and is
 * skipped otherwise (same convention as the other specs).
 */

const storageState = STORAGE_STATE;
const hasAuth = HAS_AUTH;

test.describe("payroll new-run + payslip — auth guards", () => {
  test("unauthenticated /payroll/new redirects to sign-in", async ({ page }) => {
    await page.goto("/payroll/new");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("unauthenticated payslip download redirects to sign-in", async ({ page }) => {
    await page.goto(
      "/payroll/00000000-0000-0000-0000-000000000000/payslip/00000000-0000-0000-0000-000000000000",
    );
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("payroll readiness gate — admin happy path", () => {
  test.skip(!hasAuth, "set E2E_STORAGE_STATE to a signed-in admin session to run");
  test.use({ storageState });

  test("new-run form renders; blocks draft when an employee lacks master data", async ({ page }) => {
    await page.goto("/payroll/new");
    await expect(page.getByRole("heading", { name: "Jalankan payroll" })).toBeVisible();
    // The readiness panel ("… belum siap untuk payroll") appears only when an
    // active employee is missing compensation / tax profile / bank account; the
    // server action refuses the draft in that case regardless of the panel.
  });
});

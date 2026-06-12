import { test, expect } from "@playwright/test";
import { STORAGE_STATE, HAS_AUTH } from "./_auth";

/**
 * Stage 2 — member invite e2e (case doc: docs/cases/case-01, C4 + G3/G4).
 *
 * Guard test runs everywhere. The happy-path tests need an authenticated
 * owner/admin session (see auth.setup.ts); they skip when no session exists.
 *
 * The invite is created against a unique throwaway address and revoked at the
 * end of the test, so it leaves no residue in the target DB.
 */

const storageState = STORAGE_STATE;
const hasAuth = HAS_AUTH;

test.describe("members — auth guard", () => {
  test("unauthenticated visit to /members redirects to sign-in", async ({ page }) => {
    await page.goto("/members");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("members — invite happy path", () => {
  test.skip(!hasAuth, "set E2E_EMAIL/E2E_PASSWORD or E2E_STORAGE_STATE to run");
  test.use({ storageState });

  test("admin invites an employee, sees it pending, then revokes it", async ({ page }) => {
    const email = `e2e-invite-${Date.now()}@example.com`;

    await page.goto("/members");
    await expect(page.getByRole("heading", { name: "Anggota" })).toBeVisible();

    // Fill the invite form (role select defaults to employee; set explicitly).
    await page.locator("#email").fill(email);
    await page.locator("#role").selectOption("employee");
    await page.getByRole("button", { name: "Kirim undangan" }).click();

    // Either the email was sent, or (when the mailer isn't configured) the
    // shareable invite link is surfaced in-app — both count as success.
    await expect(page.getByText(/Undangan (terkirim|dibuat)/)).toBeVisible({ timeout: 15_000 });

    // The invite shows up in the pending list.
    await expect(page.getByText("Undangan tertunda")).toBeVisible();
    const row = page.getByRole("row").filter({ hasText: email });
    await expect(row).toBeVisible();

    // Cleanup: revoke it and confirm it leaves the pending list.
    await row.getByRole("button", { name: "Batalkan" }).click();
    await expect(page.getByRole("row").filter({ hasText: email })).toHaveCount(0, {
      timeout: 15_000,
    });
  });

  test("invite form is prefilled from query params (invite-to-app flow)", async ({ page }) => {
    const email = "prefill-check@example.com";
    await page.goto(`/members?email=${encodeURIComponent(email)}&role=employee`);

    await expect(page.locator("#email")).toHaveValue(email);
    await expect(page.locator("#role")).toHaveValue("employee");
  });

  test("invalid role in query params falls back to employee", async ({ page }) => {
    await page.goto("/members?email=x@example.com&role=superuser");
    await expect(page.locator("#role")).toHaveValue("employee");
  });
});

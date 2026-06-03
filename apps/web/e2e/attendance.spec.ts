import { test, expect } from "@playwright/test";
import fs from "node:fs";

/**
 * Stage 3 — attendance dashboard e2e.
 *
 * Guard test runs everywhere (no seeded data needed). The happy-path test needs
 * an authenticated admin/manager session: provide a Playwright storageState JSON
 * via E2E_STORAGE_STATE (created once by signing in a seeded test admin). When it
 * isn't set, the happy path is skipped rather than failing on missing fixtures.
 */

const storageState = process.env.E2E_STORAGE_STATE;
const hasAuth = !!storageState && fs.existsSync(storageState);

test.describe("attendance — auth guard", () => {
  test("unauthenticated visit to /attendance redirects to sign-in", async ({ page }) => {
    await page.goto("/attendance");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("attendance — dashboard happy path", () => {
  test.skip(!hasAuth, "set E2E_STORAGE_STATE to a signed-in admin session to run");
  test.use({ storageState });

  test("admin sees the live attendance board", async ({ page }) => {
    await page.goto("/attendance");
    await expect(page.getByRole("heading", { name: "Kehadiran" })).toBeVisible();

    // The live indicator transitions from "Menyambung…" to "Langsung" once the
    // Realtime channel subscribes.
    await expect(page.getByText(/Langsung|Menyambung/)).toBeVisible();

    // Current-status and event-log tables are present.
    await expect(page.getByText("Log kejadian hari ini")).toBeVisible();
  });
});

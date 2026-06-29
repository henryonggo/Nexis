import { test, expect } from "@playwright/test";
import { STORAGE_STATE, HAS_AUTH } from "./_auth";

/**
 * Multi-company portal (/portal) e2e.
 *
 * The guard test runs everywhere (no seed needed). The authed test adapts to the
 * seeded session: a user with 2+ companies sees the portal; a single-company user
 * is redirected to /dashboard (the portal adds nothing for them). Both are valid
 * outcomes, so the test asserts the right one for whichever fixture is present
 * rather than depending on a specific multi-company seed.
 */

const storageState = STORAGE_STATE;
const hasAuth = HAS_AUTH;

test.describe("portal — auth guard", () => {
  test("unauthenticated visit to /portal redirects to sign-in", async ({ page }) => {
    await page.goto("/portal");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("portal — cross-company overview", () => {
  test.skip(!hasAuth, "set E2E_STORAGE_STATE to a signed-in session to run");
  test.use({ storageState });

  test("multi-company user sees the portal; single-company user is redirected", async ({ page }) => {
    await page.goto("/portal");
    // Settle on either the portal (2+ companies) or /dashboard (single company).
    await page.waitForURL(/\/(portal|dashboard)$/, { timeout: 15000 });

    if (new URL(page.url()).pathname === "/portal") {
      // Multi-company: KPI strip + at least one company card with an Open action.
      await expect(page.getByRole("heading", { name: "Portal" })).toBeVisible();
      const open = page.getByRole("button", { name: /^(Buka|Open)$/ });
      await expect(open.first()).toBeVisible();

      // Opening a company sets the active-company cookie and lands in the app.
      await open.first().click();
      await page.waitForURL(/\/dashboard$/, { timeout: 15000 });
    } else {
      // Single-company: the portal redirected away; no error boundary.
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByText("Something went wrong")).toHaveCount(0);
    }
  });
});

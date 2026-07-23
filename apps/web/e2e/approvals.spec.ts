import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { STORAGE_STATE, HAS_AUTH } from "./_auth";

/**
 * Pivot Phase 1 — agent approval queue e2e (the approval gate,
 * docs/pivot/PIVOT-PHASE-1.md). Guard test runs everywhere; the admin path
 * needs an authenticated owner/admin session via E2E_STORAGE_STATE and is
 * skipped when unset (same convention as the other specs).
 *
 * NEXT-7: readable payload line + agent-cycle history ("Riwayat agen") are
 * both seed-dependent (pending approval_requests / agent_cycles rows come
 * from a dry-run agent cycle), so the happy-path assertions branch on
 * whether fixtures exist — same pattern as leave-claims.spec.ts.
 */

const storageState = STORAGE_STATE;
const hasAuth = HAS_AUTH;

// Optional second session for the non-admin guard — no fixture exists for
// this in the repo yet, so it skips like the admin path does when unset.
const employeeStorageState = process.env.E2E_EMPLOYEE_STORAGE_STATE;
const hasEmployeeAuth = !!employeeStorageState && fs.existsSync(employeeStorageState);

test.describe("approvals — auth guard", () => {
  test("unauthenticated visit to /approvals redirects to sign-in", async ({ page }) => {
    await page.goto("/approvals");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

test.describe("approvals — admin queue", () => {
  test.skip(!hasAuth, "set E2E_STORAGE_STATE to a signed-in owner/admin session to run");
  test.use({ storageState });

  test("admin can open the approval queue", async ({ page }) => {
    await page.goto("/approvals");
    await expect(page.getByRole("heading", { name: "Persetujuan Agen" })).toBeVisible();
    await expect(page.getByText("Menunggu persetujuan")).toBeVisible();
  });

  // NEXT-7 piece 1: pending cards lead with a readable line (period in
  // Indonesian, or a compact run id), never the raw payload JSON up front.
  // The raw JSON stays available, but collapsed under "Detail usulan".
  test("pending request payload renders as a readable line, not raw JSON", async ({ page }) => {
    await page.goto("/approvals");

    const details = page.getByText("Detail usulan").first();
    if (await details.count()) {
      // The raw JSON lives under the collapsed <details>, not visible by default.
      await expect(page.locator("pre", { hasText: "{" })).not.toBeVisible();
      // A readable line rendered above it: either a formatted period sentence
      // or a compact "ID run:" line — never a bare "{" as the leading text.
      const readable = page.getByText(/Buat draf payroll untuk|ID run:/).first();
      await expect(readable).toBeVisible();
    } else {
      await expect(page.getByText("Tidak ada permintaan yang menunggu persetujuan.")).toBeVisible();
    }
  });

  // NEXT-7 piece 2: the agent-cycle history section is always present (a
  // real empty state when there are no cycles yet, a row per cycle otherwise).
  test("agent activity section renders", async ({ page }) => {
    await page.goto("/approvals");
    await expect(page.getByRole("heading", { name: "Riwayat agen" })).toBeVisible();

    const emptyState = page.getByText("Belum ada siklus agen yang berjalan.");
    if (await emptyState.count()) {
      await expect(emptyState).toBeVisible();
    } else {
      // At least one cycle status badge rendered from the shared cycleStatus labels.
      await expect(
        page
          .getByText(/^(Selesai|Menunggu persetujuan|Terhenti — data kurang|Ditolak model|Melebihi batas langkah|Gagal)$/)
          .first(),
      ).toBeVisible();
    }
  });
});

test.describe("approvals — non-admin guard", () => {
  test.skip(
    !hasEmployeeAuth,
    "set E2E_EMPLOYEE_STORAGE_STATE to a signed-in non-admin session to run",
  );
  test.use({ storageState: employeeStorageState });

  test("non-admin sees history but no approve/reject controls", async ({ page }) => {
    await page.goto("/approvals");
    await expect(page.getByRole("heading", { name: "Persetujuan Agen" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Riwayat agen" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Setujui" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Tolak" })).toHaveCount(0);
  });
});

import fs from "node:fs";

/**
 * Shared auth gating for the e2e happy-path tests.
 *
 * - `STORAGE_STATE` is where the signed-in admin session is written by
 *   `auth.setup.ts` and read by the authenticated specs.
 * - `HAS_AUTH` is true when we can produce or already have a session: either
 *   `E2E_EMAIL` + `E2E_PASSWORD` are set (setup will sign in and write the file),
 *   or a pre-made `E2E_STORAGE_STATE` file already exists. When false, happy-path
 *   tests skip instead of failing on missing fixtures.
 */
export const STORAGE_STATE = process.env.E2E_STORAGE_STATE ?? "playwright/.auth/admin.json";

export const HAS_AUTH =
  (!!process.env.E2E_EMAIL && !!process.env.E2E_PASSWORD) || fs.existsSync(STORAGE_STATE);

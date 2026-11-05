import { test, expect } from "@playwright/test";

/**
 * Landing page is always light: OS dark scheme, `nexis-mode=dark` cookie and the
 * `.theme-mono` class must not restyle `/`. Unauthenticated — no fixtures needed.
 */
const LIGHT_BG = "rgb(246, 248, 251)"; // --bg #f6f8fb

test.describe("landing — always light", () => {
  test.use({ colorScheme: "dark" });

  test("renders light tokens despite dark OS + nexis-mode=dark cookie", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "nexis-mode", value: "dark", url: baseURL! }]);
    await page.addInitScript(() => localStorage.setItem("nexis-theme", "mono"));
    await page.goto("/");

    // The layout script really did flip the document to dark; the page must override it.
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(page.locator("html")).toHaveClass(/theme-mono/);
    const bg = (sel: string) =>
      page.evaluate((s) => getComputedStyle(document.querySelector(s)!).backgroundColor, sel);
    expect(await bg("body")).toBe(LIGHT_BG);
    expect(await bg("html")).toBe(LIGHT_BG);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe("light");
  });
});

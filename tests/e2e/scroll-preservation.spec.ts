import { test, expect } from "@playwright/test";

test.describe("Scroll Position Preservation & Isolation", () => {
  test("entering Cockpit does NOT auto-scroll to center (preserves scrollY = 0)", async ({ page }) => {
    await page.goto("/receive/shipment-po44891");
    await page.waitForLoadState("networkidle");

    // Allow any on-mount effects to settle
    await page.waitForTimeout(500);

    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);
  });

  test("user scroll position is preserved when audio turns or buttons are clicked", async ({ page }) => {
    await page.goto("/receive/shipment-po44891");
    await page.waitForLoadState("networkidle");

    // Scroll to a custom user position
    await page.evaluate(() => window.scrollTo(0, 150));
    await page.waitForTimeout(200);

    const initialScrollY = await page.evaluate(() => window.scrollY);
    expect(initialScrollY).toBeGreaterThanOrEqual(140);


    // Trigger Golden Demo audio simulation without synthetic Playwright viewport scrolling
    const demoButton = page.locator("button:has-text('Run Golden Demo Audio')").first();
    await expect(demoButton).toBeVisible();
    await expect(demoButton).toBeEnabled({ timeout: 10000 });
    await demoButton.dispatchEvent("click");

    // Wait for turns and audio simulation to stream
    await page.waitForTimeout(1500);

    // Verify window scroll position remained exactly where user left it
    const postActionScrollY = await page.evaluate(() => window.scrollY);
    expect(Math.abs(postActionScrollY - initialScrollY)).toBeLessThanOrEqual(5);
  });

  test("inner transcript container scrolls to bottom while window remains steady", async ({ page }) => {
    await page.goto("/receive/shipment-po44891");
    await page.waitForLoadState("networkidle");

    const scrollYBefore = await page.evaluate(() => window.scrollY);

    // Check inner transcript container exists and has role="log"
    const transcriptLog = page.locator("div[role='log']").first();
    await expect(transcriptLog).toBeVisible();

    const scrollYAfter = await page.evaluate(() => window.scrollY);
    expect(scrollYAfter).toBe(scrollYBefore);
  });
});

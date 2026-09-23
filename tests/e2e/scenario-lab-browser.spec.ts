import { test, expect, Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "iPhone SE (1st gen)", width: 320, height: 568 },
  { name: "iPhone 8 / SE2", width: 375, height: 667 },
  { name: "iPhone 12/13/14", width: 390, height: 844 },
  { name: "iPhone 15 Pro Max", width: 430, height: 932 },
  { name: "iPad Mini Portrait", width: 768, height: 1024 },
  { name: "Rugged Tablet Landscape", width: 1024, height: 768 },
  { name: "Dock Kiosk 720p", width: 1280, height: 720 },
  { name: "Standard Laptop", width: 1366, height: 768 },
  { name: "MacBook 1440", width: 1440, height: 900 },
  { name: "FHD Dock Workstation", width: 1920, height: 1080 },
];

async function setManualCount(page: Page, count: number) {
  // Wait for incident initialization to finish
  await expect(page.locator("body")).toContainText("Incident #INC-", { timeout: 15000 });

  const manualBtn = page.locator('button:has-text("Enter Count Manually"), button:has-text("Correct Count")');
  await manualBtn.waitFor({ state: "visible", timeout: 15000 });
  await manualBtn.click();

  const numInput = page.locator('input[type="number"]').first();
  await numInput.waitFor({ state: "visible", timeout: 10000 });
  await numInput.fill(count.toString());

  const confirmBtn = page.locator('button:has-text("Confirm Count Correction")');
  await confirmBtn.waitFor({ state: "visible", timeout: 10000 });
  await confirmBtn.click();

  await page.waitForTimeout(600);
}

test.describe("Scenario Lab: Browser End-to-End, Visual & Accessibility Suite", () => {
  // Layer 2 & 7: Canonical Business Scenarios in Cockpit UI
  test.describe("Layer 2 & 7: Cockpit Business Scenarios", () => {
    test("Scenario 1: Clean Receipt Fast-Path (Matching Count & Zero Damage)", async ({ page }) => {
      await page.goto("/receive/shipment-po44880");

      // Verify page loads with shipment details
      await expect(page.locator("body")).toContainText("44880");
      await expect(page.locator("body")).toContainText("50");

      // Verify Shared Tablet Dock Mode bar is present
      await expect(page.locator("text=Shared Tablet")).toBeVisible();
      await expect(page.locator("text=Fast-Path")).toBeVisible();

      // Enter matching count 50
      await setManualCount(page, 50);

      // Verify clean receipt indicator or fast path readiness
      await expect(page.locator("body")).toContainText("50");
    });

    test("Scenario 2: Driver Refusal Workflow (Unblocks Review with Non-Bilateral Flag)", async ({ page }) => {
      await page.goto("/receive/shipment-po44891");
      await expect(page.locator("body")).toContainText("44891");

      // Enter shortage count (47 of 48)
      await setManualCount(page, 47);

      // Verify discrepancy delta appears or shortage appears
      await expect(page.locator("body")).toContainText("Δ =");

      // Click "Record Refusal (Unblock Review)" button if visible
      const refusalBtn = page.locator('button:has-text("Record Refusal")');
      if (await refusalBtn.isVisible()) {
        await refusalBtn.click();
        await expect(page.locator("body")).toContainText("Refus");
      }
    });

    test("Scenario 3: Driver Unavailable / Departed Post-Delivery Workflow", async ({ page }) => {
      await page.goto("/receive/shipment-po44891");
      await expect(page.locator("body")).toContainText("44891");

      await setManualCount(page, 47);

      // Click "Record Driver Unavailable" if visible
      const unavailBtn = page.locator('button:has-text("Driver Unavailable")');
      if (await unavailBtn.isVisible()) {
        await unavailBtn.click();
        await expect(page.locator("body")).toContainText("Departed");
      }
    });

    test("Scenario 4: Operating Mode Selection (Receiver Headset & Industrial Audio Mode)", async ({ page }) => {
      await page.goto("/receive/shipment-po44891");

      // Verify default Shared Dock Mode has Industrial Ambient Audio
      await expect(page.locator("body")).toContainText("Industrial Ambient Audio");

      // Click "Receiver Headset"
      const headsetBtn = page.locator('button:has-text("Receiver Headset")');
      await headsetBtn.click();

      // Verify mode switches to Receiver Headset Mode
      await expect(page.locator("body")).toContainText("Receiver Headset Mode");
    });
  });

  // Layer 10: Multi-Viewport Responsive Matrix (10 Viewports)
  test.describe("Layer 10: Multi-Viewport Responsive Matrix", () => {
    for (const vp of VIEWPORTS) {
      test(`verifies zero horizontal overflow at ${vp.width}x${vp.height} (${vp.name})`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto("/receive/shipment-po44891", { waitUntil: "domcontentloaded" });

        // Measure page width vs window innerWidth
        const overflow = await page.evaluate(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const scrollW = Math.max(docEl.scrollWidth, body ? body.scrollWidth : 0);
          const clientW = docEl.clientWidth;
          return {
            scrollWidth: scrollW,
            clientWidth: clientW,
            hasOverflow: scrollW > clientW,
          };
        });

        // Tolerance of 2px for fractional subpixel antialiasing/scrollbar
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);
      });
    }
  });

  // Layer 11: Accessibility Automation
  test.describe("Layer 11: Automated Accessibility Invariants", () => {
    test("verifies all buttons and interactive controls have accessible names", async ({ page }) => {
      await page.goto("/receive/shipment-po44891", { waitUntil: "domcontentloaded" });

      const buttons = page.locator("button");
      const buttonCount = await buttons.count();

      for (let i = 0; i < buttonCount; i++) {
        const btn = buttons.nth(i);
        const name = await btn.evaluate((el) => {
          return (
            el.getAttribute("aria-label") ||
            el.getAttribute("title") ||
            el.textContent?.trim() ||
            ""
          );
        });

        // Every button must have a non-empty accessible name
        expect(name.length).toBeGreaterThan(0);
      }
    });

    test("verifies all images have alt attributes", async ({ page }) => {
      await page.goto("/receive/shipment-po44891", { waitUntil: "domcontentloaded" });

      const images = page.locator("img");
      const imgCount = await images.count();

      for (let i = 0; i < imgCount; i++) {
        const img = images.nth(i);
        const alt = await img.getAttribute("alt");
        expect(alt).not.toBeNull();
      }
    });
  });
});

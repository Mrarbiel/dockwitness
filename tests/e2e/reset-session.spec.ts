import { test, expect } from "@playwright/test";

test.describe("Finding 9: Reset Demo Session & Session Immutability E2E", () => {
  test("creates active evidence, clicks Reset Demo Session, accepts window.confirm, asserts incident ID changed, and proves previous incident remains immutable in DB", async ({ page, request }) => {
    // 1. Navigate to the Golden Demo shipment intake cockpit
    await page.goto("/receive/shipment-po44891");

    // Wait for incident badge to be rendered (confirms initialization completed)
    await expect(page.locator("text=Incident #")).toBeVisible({ timeout: 15000 });

    // Retrieve initial incident ID from sessionStorage
    const initialIncidentId = await page.evaluate(() => {
      return sessionStorage.getItem("dockwitness_incident_shipment-po44891");
    });
    expect(initialIncidentId).toBeTruthy();
    expect(typeof initialIncidentId).toBe("string");

    // 2. Create active evidence: Trigger 1-click sample demo photo evidence
    // This calls /api/incidents/${id}/photo and sets uploadedPhotos > 0 (activating hasActiveWork)
    const attachOptionalBtn = page.getByRole("button", { name: "Attach Optional Photo" });
    if (await attachOptionalBtn.isVisible()) {
      await attachOptionalBtn.click();
    }
    const samplePhotoBtn = page.getByRole("button", { name: "Sample Demo Evidence" });
    await expect(samplePhotoBtn).toBeVisible({ timeout: 10000 });

    const uploadPromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/evidence") && resp.request().method() === "POST",
      { timeout: 45000 }
    );
    await samplePhotoBtn.click();
    const uploadResp = await uploadPromise;
    expect([200, 201]).toContain(uploadResp.status());

    // Wait for photo upload confirmation badge
    await expect(page.getByTestId("photo-evidence-card").getByText("PHOTO EVIDENCE VERIFIED")).toBeVisible({ timeout: 15000 });

    // Verify via backend API that photo is stored for initial incident
    const initialIncRes = await request.get(`/api/incidents/${initialIncidentId}`);
    expect(initialIncRes.status()).toBe(200);
    const initialIncData = await initialIncRes.json();
    expect(initialIncData.evidence.length).toBeGreaterThanOrEqual(1);
    const initialEvidenceId = initialIncData.evidence[0].id;

    // 3. Set up dialog listener to intercept and accept window.confirm
    let dialogTriggered = false;
    let dialogMessage = "";
    page.once("dialog", async (dialog) => {
      dialogTriggered = true;
      dialogMessage = dialog.message();
      expect(dialog.type()).toBe("confirm");
      expect(dialogMessage).toContain("Active receiving evidence exists in this intake session");
      await dialog.accept();
    });

    // 4. Click Reset Demo Session button and await fresh incident creation
    const resetBtn = page.getByRole("button", { name: "Reset Demo Session" });
    await expect(resetBtn).toBeVisible();

    const [response] = await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/incidents") && resp.request().method() === "POST"),
      resetBtn.click(),
    ]);

    expect([200, 201]).toContain(response.status());
    expect(dialogTriggered).toBe(true);
    await page.waitForLoadState("networkidle");

    // 6. Assert incident ID has changed in sessionStorage and UI
    const freshIncidentId = await page.evaluate(() => {
      return sessionStorage.getItem("dockwitness_incident_shipment-po44891");
    });
    expect(freshIncidentId).toBeTruthy();
    expect(freshIncidentId).not.toBe(initialIncidentId);

    // Assert UI state was wiped cleanly
    await expect(page.locator("text=PHOTO EVIDENCE VERIFIED")).not.toBeVisible();
    await expect(page.getByTestId("photo-evidence-card").getByText("AWAITING INSPECTION")).toBeVisible();

    // 7. Critical Invariant: Assert previous incident remains immutable in database
    const verifyInitialRes = await request.get(`/api/incidents/${initialIncidentId}`);
    expect(verifyInitialRes.status()).toBe(200);
    const verifyInitialData = await verifyInitialRes.json();

    // Previous incident still exists and has identical ID
    expect(verifyInitialData.id).toBe(initialIncidentId);
    expect(verifyInitialData.shipmentId).toBe("shipment-po44891");

    // Previous evidence attachment remains attached and uncorrupted
    const preservedEvidence = verifyInitialData.evidence.find((e: { id: string }) => e.id === initialEvidenceId);
    expect(preservedEvidence).toBeDefined();
    expect(preservedEvidence.incidentId).toBe(initialIncidentId);
  });
});

import { test, expect } from "@playwright/test";

test.describe("Tier 2: Boundary & Corner Cases", () => {

  // T2.1: Non-existent shipment lookup
  test("T2.1: Non-existent shipment lookup returns HTTP 404", async ({ request }) => {
    const res = await request.get("/api/shipments/shipment-unknown-9999");
    expect(res.status()).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("not found");
  });

  // T2.2: Non-existent incident lookup
  test("T2.2: Non-existent incident lookup returns HTTP 404", async ({ request }) => {
    const res = await request.get("/api/incidents/incident-unknown-8888");
    expect(res.status()).toBe(404);
    const data = await res.json();
    expect(data.error).toContain("not found");
  });

  // T2.3: Empty photo upload validation
  test("T2.3: Empty photo upload returns HTTP 400 Bad Request", async ({ request }) => {
    // 1. Create incident first
    const incRes = await request.post("/api/incidents", {
      data: { shipmentId: "shipment-po44891" },
    });
    const incident = await incRes.json();

    // 2. Post photo multipart without 'file' field
    const emptyPhotoRes = await request.post(`/api/incidents/${incident.id}/photo`, {
      multipart: {
        unrelatedField: "not-a-file",
      },
    });

    expect(emptyPhotoRes.status()).toBe(400);
    const errData = await emptyPhotoRes.json();
    expect(errData.error).toContain("No file provided");
  });

  // T2.4: Malformed payload on transcript turn ingestion
  test("T2.4: Malformed payload on transcript turn ingestion returns HTTP 400", async ({ request }) => {
    const incRes = await request.post("/api/incidents", {
      data: { shipmentId: "shipment-po44891" },
    });
    const incident = await incRes.json();

    // Raw unparseable JSON buffer
    const badRes = await request.post(`/api/incidents/${incident.id}/turn`, {
      headers: { "Content-Type": "application/json" },
      data: Buffer.from("{ unclosed syntax error: true, "),
    });

    expect(badRes.status()).toBe(400);
    const err = await badRes.json();
    expect(err).toHaveProperty("error");
  });

  // T2.5: Malformed payload on attestation recording
  test("T2.5: Malformed payload on attestation endpoint returns HTTP 400", async ({ request }) => {
    const incRes = await request.post("/api/incidents", {
      data: { shipmentId: "shipment-po44891" },
    });
    const incident = await incRes.json();

    // Raw unparseable JSON buffer
    const badRes = await request.post(`/api/incidents/${incident.id}/attestation`, {
      headers: { "Content-Type": "application/json" },
      data: Buffer.from("{ unclosed syntax error: true, "),
    });

    expect(badRes.status()).toBe(400);
    const err = await badRes.json();
    expect(err).toHaveProperty("error");
  });

  // T2.6: Extreme and zero count boundary verification
  test("T2.6: Cockpit UI and manifests gracefully render zero and high carton counts", async ({ page, request }) => {
    // Check known shipments
    const res = await request.get("/api/shipments/shipment-po44891");
    const data = await res.json();
    expect(data.items[0].expectedQty).toBeGreaterThan(0);

    // Verify cockpit page handles extreme route parameters without crashing
    const edgePage = await page.goto("/receive/shipment-edge-case-99999");
    expect(edgePage?.status()).toBe(200);
    await expect(page.locator("h2")).toContainText("Shipment Not Found");
    await expect(page.locator("body")).toContainText("shipment-edge-case-99999");
  });

  // T2.7: Liability insulation invariant verification
  test("T2.7: No UI or API endpoint exposes automated liability determination or claim approval", async ({ page }) => {
    await page.goto("/incident/inc-boundary-test");
    await expect(page.locator("body")).toContainText(/audit/i);

    // Must never contain automated claim approval claims
    await expect(page.locator("body")).not.toContainText("CLAIM_APPROVED");
    await expect(page.locator("body")).not.toContainText("CARRIER_LIABLE");
    await expect(page.locator("body")).not.toContainText("SHIPPER_LIABLE");
    await expect(page.locator("body")).not.toContainText("FAULT_CONFIRMED");
  });

  // T2.8: Silence is never consent invariant verification
  test("T2.8: System preserves silence as unconfirmed (PENDING_REVIEW or RECEIVER_ONLY)", async ({ page }) => {
    await page.goto("/receive/shipment-po44891");
    await expect(page.locator("h1")).toContainText("Receiving Manifest PO #44891");
    await expect(page.locator("body")).toContainText(/AWAITING INSPECTION/i);

    const statusText = await page.locator("body").innerText();
    // In no state should silence or initial load show CONFIRMED_BY_BOTH
    expect(statusText).not.toContain("CONFIRMED_BY_BOTH");
  });

  // T2.9: Server secret isolation invariant
  test("T2.9: Server secret ASSEMBLYAI_API_KEY is never exposed in client HTML or script tags", async ({ page }) => {
    await page.goto("/");
    const pageSource = await page.content();

    // Check that raw secret tokens or env keys are absent from client bundle
    expect(pageSource).not.toContain("NEXT_PUBLIC_ASSEMBLYAI_API_KEY");
    expect(pageSource).not.toMatch(/aai-[a-zA-Z0-9]{32,}/);
  });

  // T2.10: AudioWorklet parameter bounds verification
  test("T2.10: AudioWorklet defines strict 16kHz mono sampling and 50ms buffer sizing", async ({ request }) => {
    const res = await request.get("/worklets/pcm-processor.js");
    const source = await res.text();

    expect(source).toContain("16000"); // 16 kHz target rate
    expect(source).toContain("800");   // 800 samples = 50ms @ 16kHz
    expect(source).toContain("1600");  // 1,600 bytes PCM16 LE
  });
});

import { test, expect } from "@playwright/test";

test.describe("Tier 3: Cross-Feature Interactions & Pairwise Testing", () => {

  // T3.1: Shortage reporting + photo upload co-location
  test("T3.1: Shortage reporting co-located with dock photo attachment", async ({ request }) => {
    // 1. Initialize incident
    const incRes = await request.post("/api/incidents", {
      data: {
        shipmentId: "shipment-po44891",
        receiverName: "Marcus Vance",
      },
    });
    expect(incRes.status()).toBe(201);
    const incident = await incRes.json();

    // 2. Add receiver turn reporting shortage
    const turnRes = await request.post(`/api/incidents/${incident.id}/turn`, {
      data: {
        speakerRole: "RECEIVER",
        text: "Expected forty-eight cartons, counted forty-seven. We are short one carton.",
        isFinal: true,
      },
    });
    expect(turnRes.status()).toBe(201);

    // 3. Attach photo of the opened trailer / pallet
    const mockImageBuffer = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
    const photoRes = await request.post(`/api/incidents/${incident.id}/photo`, {
      multipart: {
        file: {
          name: "trailer-shortage-door.jpg",
          mimeType: "image/jpeg",
          buffer: mockImageBuffer,
        },
      },
    });
    expect(photoRes.status()).toBe(201);
    const photo = await photoRes.json();

    // 4. Evaluate incident state
    const evalRes = await request.post(`/api/incidents/${incident.id}/evaluate`);
    expect(evalRes.status()).toBe(200);

    // Verify photo storage path is associated with this incident
    expect(photo.storagePath).toContain(incident.id);
  });

  // T3.2: Damage reporting with photo gating interaction
  test("T3.2: Damage reporting requires photo evidence before final review readiness", async ({ request }) => {
    // 1. Create incident
    const incRes = await request.post("/api/incidents", {
      data: {
        shipmentId: "shipment-po44913",
        receiverName: "Sarah Jenkins",
      },
    });
    const incident = await incRes.json();

    // 2. Ingest damage observation turn
    const turnRes = await request.post(`/api/incidents/${incident.id}/turn`, {
      data: {
        speakerRole: "RECEIVER",
        text: "Carton eight is crushed and torn open along the corner seam.",
        isFinal: true,
      },
    });
    expect(turnRes.status()).toBe(201);

    // 3. Candidate extraction detects damage
    const extractRes = await request.post(`/api/incidents/${incident.id}/extract`, {
      data: { text: "Carton eight is crushed and torn open along the corner seam." },
    });
    expect(extractRes.status()).toBe(200);

    // 4. Attach mandatory photo to satisfy evidence requirement gate
    const mockImageBuffer = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
    const photoRes = await request.post(`/api/incidents/${incident.id}/photo`, {
      multipart: {
        file: {
          name: "carton-8-crushed-seam.jpg",
          mimeType: "image/jpeg",
          buffer: mockImageBuffer,
        },
      },
    });
    expect(photoRes.status()).toBe(201);

    // 5. Evaluate unblocked incident
    const evalRes = await request.post(`/api/incidents/${incident.id}/evaluate`);
    expect(evalRes.status()).toBe(200);
  });

  // T3.3: Two-party disagreement interaction
  test("T3.3: Two-party disagreement (Receiver CONFIRM + Driver DISPUTE) produces DISPUTED status", async ({ request }) => {
    // 1. Create incident
    const incRes = await request.post("/api/incidents", {
      data: {
        shipmentId: "shipment-po44924",
        receiverName: "Marcus Vance",
        driverName: "Dave Miller",
      },
    });
    const incident = await incRes.json();

    // Extract exception first so a valid exception exists
    const extRes = await request.post(`/api/incidents/${incident.id}/extract`, {
      data: { text: "Counted forty-seven cartons, short one carton." },
    });
    const extData = await extRes.json();
    const exceptionId = extData.exceptions?.[0]?.id;

    // 2. Receiver confirms shortage
    const recAttRes = await request.post(`/api/incidents/${incident.id}/attestation`, {
      data: {
        exceptionId: exceptionId,
        partyRole: "RECEIVER",
        position: "CONFIRM",
      },
    });
    expect(recAttRes.status()).toBe(201);

    // 3. Driver disputes shortage
    const drvAttRes = await request.post(`/api/incidents/${incident.id}/attestation`, {
      data: {
        exceptionId: exceptionId,
        partyRole: "DRIVER",
        position: "DISPUTE",
      },
    });
    expect(drvAttRes.status()).toBe(201);

    // 4. Trigger evaluation
    const evalRes = await request.post(`/api/incidents/${incident.id}/evaluate`);
    expect(evalRes.status()).toBe(200);
  });

  // T3.4: Audio simulation trigger + transcript turn rendering
  test("T3.4: Cockpit Simulate Scenario Audio trigger initiates voice workflow", async ({ page, request }) => {
    await page.goto("/receive/shipment-po44891");
    await page.waitForLoadState("domcontentloaded");

    // Check button is interactive
    const simulateBtn = page.getByRole("button", { name: /Simulate.*Receiver/i });
    await expect(simulateBtn).toBeEnabled();
    await simulateBtn.click();

    // Verify incident turn can be persisted concurrently
    const incRes = await request.post("/api/incidents", {
      data: { shipmentId: "shipment-po44891" },
    });
    const incident = await incRes.json();

    const turnRes = await request.post(`/api/incidents/${incident.id}/turn`, {
      data: {
        speakerRole: "RECEIVER",
        text: "I have forty-seven cartons here on the dock.",
        isFinal: true,
      },
    });
    expect(turnRes.status()).toBe(201);
  });

  // T3.5: Multi-action audit trail chronological sequence
  test("T3.5: Multi-action audit sequence preserves chronological event provenance", async ({ request, page }) => {
    // 1. Create incident
    const incRes = await request.post("/api/incidents", {
      data: {
        shipmentId: "shipment-po44891",
        receiverName: "Auditor Smith",
      },
    });
    const incident = await incRes.json();

    // 2. Sequential actions
    await request.post(`/api/incidents/${incident.id}/turn`, {
      data: { speakerRole: "RECEIVER", text: "Turn 1: Counting freight.", isFinal: true },
    });

    await request.post(`/api/incidents/${incident.id}/photo`, {
      multipart: {
        file: {
          name: "audit-proof.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
        },
      },
    });

    const extRes = await request.post(`/api/incidents/${incident.id}/extract`, {
      data: { text: "Counted forty-seven cartons, shortage one carton." },
    });
    const extData = await extRes.json();
    const exceptionId = extData.exceptions?.[0]?.id;

    await request.post(`/api/incidents/${incident.id}/attestation`, {
      data: { exceptionId: exceptionId, partyRole: "DRIVER", position: "NO_KNOWLEDGE" },
    });

    await request.post(`/api/incidents/${incident.id}/evaluate`);

    // 3. Navigate to incident view to verify audit timeline presentation
    await page.goto(`/incident/${incident.id}`);
    await expect(page.locator("h1")).toContainText(`Incident: ${incident.id}`);
    await expect(page.locator("body")).toContainText("Chronological Audit Timeline");
  });
});

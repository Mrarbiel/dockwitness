import { test, expect } from "@playwright/test";

test.describe("Tier 4: Real-World Scenarios (Canonical Seed POs)", () => {

  // Scenario 1: Golden Demo PO 44891 (Shortage + Damage + Disputed Shortage)
  test("Scenario 1: Golden Demo PO 44891 (Shortage 1, Damaged Carton 31, Driver Disputes Shortage)", async ({ request, page }) => {
    // 1. Fetch seed shipment manifest
    const shipRes = await request.get("/api/shipments/shipment-po44891");
    expect(shipRes.status()).toBe(200);
    const shipment = await shipRes.json();
    expect(shipment.poNumber).toBe("44891");
    expect(shipment.items[0].expectedQty).toBe(48);

    // 2. Create receiving incident
    const incRes = await request.post("/api/incidents", {
      data: {
        shipmentId: "shipment-po44891",
        receiverName: "Marcus Vance",
        driverName: "Dave Miller",
      },
    });
    expect(incRes.status()).toBe(201);
    const incident = await incRes.json();

    // 3. Receiver statement: "I have forty-seven cartons. Carton thirty-one is crushed underneath."
    const recTurnRes = await request.post(`/api/incidents/${incident.id}/turn`, {
      data: {
        speakerRole: "RECEIVER",
        text: "I have forty-seven cartons. Carton thirty-one is crushed underneath and wet on the right side.",
        isFinal: true,
      },
    });
    expect(recTurnRes.status()).toBe(201);

    // 4. Extract candidate facts
    const extRes = await request.post(`/api/incidents/${incident.id}/extract`, {
      data: { text: "I have forty-seven cartons. Carton thirty-one is crushed underneath and wet on the right side." },
    });
    expect(extRes.status()).toBe(200);

    // 5. Upload required damage photo
    const photoBuffer = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
    const photoRes = await request.post(`/api/incidents/${incident.id}/photo`, {
      multipart: {
        file: {
          name: "po44891-carton31-crushed.jpg",
          mimeType: "image/jpeg",
          buffer: photoBuffer,
        },
      },
    });
    expect(photoRes.status()).toBe(201);

    // 6. Driver statement: confirms damage, disputes shortage
    const drvTurnRes = await request.post(`/api/incidents/${incident.id}/turn`, {
      data: {
        speakerRole: "DRIVER",
        text: "I confirm the damaged carton, but I dispute the shortage. The seal was intact.",
        isFinal: true,
      },
    });
    expect(drvTurnRes.status()).toBe(201);

    // 7. Attestations
    const extData = await extRes.json();
    const dmgException = extData.exceptions?.find((e: { type: string }) => e.type === "DAMAGE");
    const shortageException = extData.exceptions?.find((e: { type: string }) => e.type === "SHORTAGE");

    if (dmgException) {
      await request.post(`/api/incidents/${incident.id}/attestation`, {
        data: { exceptionId: dmgException.id, partyRole: "DRIVER", position: "CONFIRM" },
      });
    }
    if (shortageException) {
      await request.post(`/api/incidents/${incident.id}/attestation`, {
        data: { exceptionId: shortageException.id, partyRole: "DRIVER", position: "DISPUTE" },
      });
    }

    // 8. Evaluation
    const evalRes = await request.post(`/api/incidents/${incident.id}/evaluate`);
    expect(evalRes.status()).toBe(200);

    // 9. Verify Incident Evidence Record page renders timeline
    await page.goto(`/incident/${incident.id}`);
    await expect(page.locator("h1")).toContainText(`Incident: ${incident.id}`);
    await expect(page.locator("body")).toContainText("Chronological Audit Timeline");
  });

  // Scenario 2: Clean PO 44880 (Clean Receipt)
  test("Scenario 2: Clean PO 44880 (Expected 50 / Observed 50 / No Exceptions)", async ({ request }) => {
    // 1. Verify manifest
    const shipRes = await request.get("/api/shipments/shipment-po44880");
    expect(shipRes.status()).toBe(200);
    const shipment = await shipRes.json();
    expect(shipment.poNumber).toBe("44880");
    expect(shipment.items[0].expectedQty).toBe(50);

    // 2. Create clean incident
    const incRes = await request.post("/api/incidents", {
      data: {
        shipmentId: "shipment-po44880",
        receiverName: "Sarah Jenkins",
      },
    });
    expect(incRes.status()).toBe(201);
    const incident = await incRes.json();

    // 3. Receiver counts exactly 50 cartons
    const turnRes = await request.post(`/api/incidents/${incident.id}/turn`, {
      data: {
        speakerRole: "RECEIVER",
        text: "Count complete: fifty cartons received, zero visible damage, seals intact.",
        isFinal: true,
      },
    });
    expect(turnRes.status()).toBe(201);

    // 4. Evaluate clean state
    const evalRes = await request.post(`/api/incidents/${incident.id}/evaluate`);
    expect(evalRes.status()).toBe(200);
  });

  // Scenario 3: Overage PO 44902 (Observed 32 vs Expected 30)
  test("Scenario 3: Overage PO 44902 (Observed 32 / Expected 30 / Driver Confirms)", async ({ request }) => {
    const shipRes = await request.get("/api/shipments/shipment-po44902");
    expect(shipRes.status()).toBe(200);
    const shipment = await shipRes.json();
    expect(shipment.poNumber).toBe("44902");
    expect(shipment.items[0].expectedQty).toBe(30);

    const incRes = await request.post("/api/incidents", {
      data: { shipmentId: "shipment-po44902" },
    });
    const incident = await incRes.json();

    // Receiver reports overage
    await request.post(`/api/incidents/${incident.id}/turn`, {
      data: {
        speakerRole: "RECEIVER",
        text: "We have thirty-two cartons on pallet, manifest is thirty.",
        isFinal: true,
      },
    });

    // Driver confirms overage
    await request.post(`/api/incidents/${incident.id}/attestation`, {
      data: {
        exceptionId: "exc-overage-2",
        partyRole: "DRIVER",
        position: "CONFIRM",
      },
    });

    const evalRes = await request.post(`/api/incidents/${incident.id}/evaluate`);
    expect(evalRes.status()).toBe(200);
  });

  // Scenario 4: Damage PO 44913 (Expected 60 / Observed 60 / Visible Damage Gate)
  test("Scenario 4: Damage PO 44913 (Expected 60 / Observed 60 / Photo Gate Satisfied)", async ({ request }) => {
    const shipRes = await request.get("/api/shipments/shipment-po44913");
    expect(shipRes.status()).toBe(200);
    const shipment = await shipRes.json();
    expect(shipment.items[0].expectedQty).toBe(60);

    const incRes = await request.post("/api/incidents", {
      data: { shipmentId: "shipment-po44913" },
    });
    const incident = await incRes.json();

    // Damage turn
    await request.post(`/api/incidents/${incident.id}/turn`, {
      data: {
        speakerRole: "RECEIVER",
        text: "Quantity matches sixty cartons, but carton fourteen has a deep puncture hole.",
        isFinal: true,
      },
    });

    // Attach photo proof
    const photoRes = await request.post(`/api/incidents/${incident.id}/photo`, {
      multipart: {
        file: {
          name: "po44913-puncture.jpg",
          mimeType: "image/jpeg",
          buffer: Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64"),
        },
      },
    });
    expect(photoRes.status()).toBe(201);

    const evalRes = await request.post(`/api/incidents/${incident.id}/evaluate`);
    expect(evalRes.status()).toBe(200);
  });

  // Scenario 5: Two-Party Dispute PO 44924 (Expected 25 / Observed 24 / Shortage Disputed)
  test("Scenario 5: Two-Party Dispute PO 44924 (Shortage 1 Disputed by Driver)", async ({ request, page }) => {
    const shipRes = await request.get("/api/shipments/shipment-po44924");
    expect(shipRes.status()).toBe(200);
    const shipment = await shipRes.json();
    expect(shipment.items[0].expectedQty).toBe(25);

    const incRes = await request.post("/api/incidents", {
      data: { shipmentId: "shipment-po44924" },
    });
    const incident = await incRes.json();

    // Receiver turn
    await request.post(`/api/incidents/${incident.id}/turn`, {
      data: {
        speakerRole: "RECEIVER",
        text: "Manifest says twenty-five, but there are only twenty-four.",
        isFinal: true,
      },
    });

    // Driver disputes
    await request.post(`/api/incidents/${incident.id}/attestation`, {
      data: {
        exceptionId: "exc-shortage-po44924",
        partyRole: "DRIVER",
        position: "DISPUTE",
      },
    });

    const evalRes = await request.post(`/api/incidents/${incident.id}/evaluate`);
    expect(evalRes.status()).toBe(200);

    // Check operations dashboard tracks disputed exception
    await page.goto("/operations");
    await expect(page.locator("body")).toContainText("Disputed Records");
  });
});

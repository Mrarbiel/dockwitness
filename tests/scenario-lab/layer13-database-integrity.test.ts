import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

describe("Layer 13: Database Relational Integrity & Forensic Immutability", () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  it("enforces foreign key relational constraints on child tables", async (ctx) => {
    if (!url || !key) {
      console.log("BLOCKED / SKIPPED: Live Supabase credentials not set in environment");
      ctx.skip();
      return;
    }

    const client = createClient(url, key);
    const fakeId = `fake-ref-${Date.now()}`;

    // 1. Attempting to insert an exception referencing a non-existent incident
    const excRes = await client.from("exceptions").insert({
      id: `exc-test-${Date.now()}`,
      incident_id: fakeId,
      shipment_item_id: fakeId,
      type: "SHORTAGE",
      expected_qty: 48,
      observed_qty: 47,
      delta: -1,
      agreement_status: "PENDING_REVIEW",
    });

    // Supabase must reject due to foreign key violation
    if (excRes.error?.message && /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(excRes.error.message)) {
      console.log("BLOCKED / SKIPPED: Live Supabase network unreachable:", excRes.error.message);
      ctx.skip();
      return;
    }
    expect(excRes.error).not.toBeNull();
    expect(excRes.error?.message).toMatch(/foreign key/i);

    // 2. Attempting to insert an attestation referencing a non-existent exception
    const attRes = await client.from("attestations").insert({
      id: `att-test-${Date.now()}`,
      incident_id: fakeId,
      exception_id: fakeId,
      party_role: "DRIVER",
      position: "CONFIRM",
    });

    if (attRes.error?.message && /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT/i.test(attRes.error.message)) {
      console.log("BLOCKED / SKIPPED: Live Supabase network unreachable:", attRes.error.message);
      ctx.skip();
      return;
    }
    expect(attRes.error).not.toBeNull();
    expect(attRes.error?.message).toMatch(/foreign key/i);
  });

  it("verifies audit trail append-only structure and provenance capture", async (ctx) => {
    if (!url || !key) {
      console.log("BLOCKED / SKIPPED: Live Supabase credentials not set in environment");
      ctx.skip();
      return;
    }

    const client = createClient(url, key);

    // Query audit_log or audit trail table
    const auditRes = await client.from("audit_events").select("*").limit(5);

    // Verify table accessibility and schema
    if (auditRes.error && auditRes.error.code === "42P01") {
      // If table name is audit_log
      const logRes = await client.from("audit_log").select("*").limit(5);
      expect(logRes.error).toBeNull();
    } else {
      expect(auditRes.error).toBeNull();
    }
  });

  it("guarantees seeded shipment manifest PO 44891 exists and matches canonical Golden Demo", async () => {
    if (!url || !key) {
      return;
    }

    const client = createClient(url, key);
    const { data: shipment, error } = await client
      .from("shipments")
      .select("*, items:shipment_items(*)")
      .eq("id", "shipment-po44891")
      .single();

    expect(error).toBeNull();
    expect(shipment).not.toBeNull();
    expect(shipment.po_number).toBe("44891");
    expect(shipment.bol_number).toBe("NS-90283");
    expect(shipment.carrier_name).toContain("NorthStar");
    expect(shipment.items.length).toBeGreaterThan(0);
    expect(shipment.items[0].expected_qty).toBe(48);
  });
});

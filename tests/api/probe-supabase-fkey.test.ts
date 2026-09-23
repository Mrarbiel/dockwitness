import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

describe("Supabase Foreign Key & Database Invariant Probe", () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  it("probes live Supabase for foreign key constraint enforcement on attestations", async (ctx) => {
    if (!url || !key) {
      console.log("BLOCKED / SKIPPED: Live Supabase credentials not set in environment");
      ctx.skip();
      return;
    }

    const client = createClient(url, key);
    const incId = `test-inc-${Date.now()}`;
    const incRes = await client.from("incidents").insert({
      id: incId,
      shipment_id: "shipment-po44891",
      incident_number: `INC-${Date.now().toString().slice(-5)}`,
      status: "CAPTURING",
      started_at: new Date().toISOString(),
    });

    expect(incRes.error).toBeNull();

    // Attempt to insert attestation with fake exception ID
    const attRes = await client.from("attestations").insert({
      id: `test-att-${Date.now()}`,
      incident_id: incId,
      exception_id: "nonexistent-synthetic-exc-99999",
      party_role: "DRIVER",
      position: "CONFIRM",
      created_at: new Date().toISOString(),
    });

    console.log("[SUPABASE LIVE PROBE] Insert attestation with fake exceptionId:", attRes.error?.message);

    // Foreign key constraint MUST reject this:
    expect(attRes.error).not.toBeNull();
    expect(attRes.error!.message).toContain("foreign key constraint");

    // Cleanup
    await client.from("incidents").delete().eq("id", incId);
  }, 30000);
});

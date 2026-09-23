import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MockStoreRepository, SupabaseDataRepository } from "@/lib/repository";

describe("Production Fail-Closed Invariants for SupabaseDataRepository", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalUseMockStore = process.env.USE_MOCK_STORE;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  afterEach(() => {
    (process.env as any).NODE_ENV = originalNodeEnv;
    process.env.USE_MOCK_STORE = originalUseMockStore;
    process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalAnonKey;
  });

  it("1. Proves explicit mock mode works when USE_MOCK_STORE=true even if NODE_ENV=production", async () => {
    (process.env as any).NODE_ENV = "production";
    process.env.USE_MOCK_STORE = "true";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const mockFallback = new MockStoreRepository();
    const repo = new SupabaseDataRepository(mockFallback);

    const shipments = await repo.getShipments();
    expect(shipments).toBeDefined();
    expect(shipments.length).toBeGreaterThan(0);
  });

  it("2. Proves production mode throws configuration error when DB config is missing", () => {
    (process.env as any).NODE_ENV = "production";
    delete process.env.USE_MOCK_STORE;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    expect(() => {
      new SupabaseDataRepository();
    }).toThrowError(/Missing Supabase configuration in production environment/);
  });

  it("3. Proves production DB network error throws and fails closed without silent fallback", async () => {
    (process.env as any).NODE_ENV = "production";
    delete process.env.USE_MOCK_STORE;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mockproject.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-service-role-key";

    const mockFallback = new MockStoreRepository();
    const repo = new SupabaseDataRepository(mockFallback);

    // Inject hostile client that simulates network crash
    const hostileClient = {
      from: () => ({
        select: () => {
          throw new Error("Network timeout: connection reset by peer (ECONNRESET)");
        },
        insert: () => {
          throw new Error("Postgres connection terminated unexpectedly (500)");
        },
        update: () => {
          throw new Error("Database unavailable: 503 Service Unavailable");
        },
      }),
    };
    (repo as any).client = hostileClient;

    // Operation must throw, not return fallback data
    await expect(repo.getShipments()).rejects.toThrowError(/connection reset by peer/);
    await expect(
      repo.createIncident({
        id: "inc-fail-closed-1",
        shipmentId: "shipment-po44891",
        incidentNumber: "INC-FC-001",
        status: "DRAFT",
        startedAt: new Date().toISOString(),
      })
    ).rejects.toThrowError(/Postgres connection terminated/);
  });

  it("4. Proves no fallback data is returned after production DB error occurs", async () => {
    (process.env as any).NODE_ENV = "production";
    delete process.env.USE_MOCK_STORE;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mockproject.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "mock-service-role-key";

    const mockFallback = new MockStoreRepository();
    // Pre-populate mock store with an incident
    await mockFallback.createIncident({
      id: "inc-mock-secret",
      shipmentId: "shipment-po44891",
      incidentNumber: "INC-SECRET-999",
      status: "DRAFT",
      startedAt: new Date().toISOString(),
    });

    const repo = new SupabaseDataRepository(mockFallback);

    // Hostile client throws
    const hostileClient = {
      from: () => ({
        select: () => {
          throw new Error("Fatal: remote database server crashed");
        },
      }),
    };
    (repo as any).client = hostileClient;

    // In production fail-closed, getIncident MUST NOT return the mockFallback data!
    await expect(repo.getIncident("inc-mock-secret")).rejects.toThrowError(/Fatal: remote database server crashed/);
  });
});

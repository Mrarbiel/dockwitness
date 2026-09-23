import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { Client } from "pg";

import * as fs from "fs";
import * as path from "path";

describe("Isolated Database RPC Existence & Security Definer Permissions (Release-Blocker 3)", () => {
  const PG_HOST = process.env.TEST_PG_HOST || "127.0.0.1";
  const PG_PORT = parseInt(process.env.TEST_PG_PORT || "5432", 10);
  const PG_USER = process.env.TEST_PG_USER || "postgres";
  const PG_PASSWORD = process.env.TEST_PG_PASSWORD || "postgres";
  const TEST_DB = "dockwitness_isolated_test";

  let adminClient: Client;
  let serviceRoleClient: Client;
  let anonClient: Client;
  let pgAvailable = false;

  beforeAll(async () => {
    // 1. Connect to default postgres DB as admin to provision isolated test database and roles
    try {
      adminClient = new Client({
        host: PG_HOST,
        port: PG_PORT,
        user: PG_USER,
        password: PG_PASSWORD,
        database: "postgres",
      });
      await adminClient.connect();
      pgAvailable = true;
    } catch (err: any) {
      console.warn(`[isolated-rpc-permissions] Local PostgreSQL (127.0.0.1:5432) not available (${err.message}). Skipping isolated RPC permissions suite.`);
      return;
    }


    // Terminate existing connections to test DB if any, then drop and recreate
    await adminClient.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '${TEST_DB}' AND pid <> pg_backend_pid();
    `);
    await adminClient.query(`DROP DATABASE IF EXISTS ${TEST_DB};`);
    await adminClient.query(`CREATE DATABASE ${TEST_DB};`);

    // 2. Provision standard Supabase roles
    await adminClient.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'test_anon_user') THEN
          CREATE ROLE test_anon_user LOGIN PASSWORD 'test_anon_pass';
        END IF;
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'test_service_user') THEN
          CREATE ROLE test_service_user LOGIN PASSWORD 'test_service_pass';
        END IF;
      END $$;
    `);

    // Assign role memberships
    await adminClient.query(`GRANT anon TO test_anon_user;`);
    await adminClient.query(`GRANT service_role TO test_service_user;`);

    // Close admin client to postgres DB
    await adminClient.end();

    // 3. Connect as admin to the fresh isolated test database
    adminClient = new Client({
      host: PG_HOST,
      port: PG_PORT,
      user: PG_USER,
      password: PG_PASSWORD,
      database: TEST_DB,
    });
    await adminClient.connect();

    // Grant schema usage and default permissions
    await adminClient.query(`
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, test_anon_user, test_service_user;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role, postgres;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role, postgres;
      GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role, postgres;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;
    `);

    // 4. Read and apply migrations 00001, 00002, 00003
    const repoRoot = path.resolve(__dirname, "../../");
    const m1 = fs.readFileSync(path.join(repoRoot, "supabase/migrations/00001_initial_schema.sql"), "utf-8");
    const m2 = fs.readFileSync(path.join(repoRoot, "supabase/migrations/00002_immutability_and_rls.sql"), "utf-8");
    const m3 = fs.readFileSync(path.join(repoRoot, "supabase/migrations/00003_atomic_rpc_and_hardening.sql"), "utf-8");

    await adminClient.query(m1);
    await adminClient.query(m2);
    await adminClient.query(m3);

    // Explicitly grant table permissions in test DB to service_role (service role bypasses RLS and writes all tables)
    await adminClient.query(`
      GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role, test_service_user;
      GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role, test_service_user;
    `);

    // 5. Connect dedicated service_role and anon clients
    serviceRoleClient = new Client({
      host: PG_HOST,
      port: PG_PORT,
      user: "test_service_user",
      password: "test_service_pass",
      database: TEST_DB,
    });
    await serviceRoleClient.connect();
    await serviceRoleClient.query(`SET ROLE service_role;`);

    anonClient = new Client({
      host: PG_HOST,
      port: PG_PORT,
      user: "test_anon_user",
      password: "test_anon_pass",
      database: TEST_DB,
    });
    await anonClient.connect();
    await anonClient.query(`SET ROLE anon;`);
  });

  beforeEach((ctx) => {
    if (!pgAvailable) {
      ctx.skip();
    }
  });

  afterAll(async () => {
    if (!pgAvailable) return;
    if (anonClient) await anonClient.end().catch(() => {});
    if (serviceRoleClient) await serviceRoleClient.end().catch(() => {});
    if (adminClient) await adminClient.end().catch(() => {});
  });


  it("verifies idempotent bootstrap #1 and #2 (5 shipments / 5 items / 0 incidents / 0 audit events)", async () => {
    const repoRoot = path.resolve(__dirname, "../../");
    const seedSql = fs.readFileSync(path.join(repoRoot, "supabase/seed.sql"), "utf-8");

    // Bootstrap #1
    await adminClient.query(seedSql);

    const check1 = await adminClient.query(`
      SELECT
        (SELECT COUNT(*)::int FROM shipments) AS shipments_count,
        (SELECT COUNT(*)::int FROM shipment_items) AS items_count,
        (SELECT COUNT(*)::int FROM incidents) AS incidents_count,
        (SELECT COUNT(*)::int FROM audit_events) AS audit_count;
    `);

    expect(check1.rows[0]).toEqual({
      shipments_count: 5,
      items_count: 5,
      incidents_count: 0,
      audit_count: 0,
    });

    // Bootstrap #2 (idempotent re-run)
    await adminClient.query(seedSql);

    const check2 = await adminClient.query(`
      SELECT
        (SELECT COUNT(*)::int FROM shipments) AS shipments_count,
        (SELECT COUNT(*)::int FROM shipment_items) AS items_count,
        (SELECT COUNT(*)::int FROM incidents) AS incidents_count,
        (SELECT COUNT(*)::int FROM audit_events) AS audit_count;
    `);

    expect(check2.rows[0]).toEqual({
      shipments_count: 5,
      items_count: 5,
      incidents_count: 0,
      audit_count: 0,
    });
  });

  it("verifies first that both atomic RPC functions EXIST in the isolated database", async () => {
    const res = await adminClient.query(`
      SELECT proname, prosecdef
      FROM pg_proc
      JOIN pg_namespace ON pg_proc.pronamespace = pg_namespace.oid
      WHERE pg_namespace.nspname = 'public'
        AND proname IN ('record_observation_atomic', 'record_attestation_atomic')
      ORDER BY proname;
    `);

    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].proname).toBe("record_attestation_atomic");
    expect(res.rows[0].prosecdef).toBe(true); // SECURITY DEFINER
    expect(res.rows[1].proname).toBe("record_observation_atomic");
    expect(res.rows[1].prosecdef).toBe(true); // SECURITY DEFINER
  });

  it("service_role: record_observation_atomic is executable and commits single-transaction records", async () => {
    // 1. Create incident as service_role
    await serviceRoleClient.query(`
      INSERT INTO incidents (id, shipment_id, incident_number, status, started_at)
      VALUES ('inc-test-sr-1', 'shipment-po44891', 'INC-SR-001', 'IN_PROGRESS', NOW());
    `);

    // 2. Call record_observation_atomic
    const res = await serviceRoleClient.query(`
      SELECT record_observation_atomic(
        p_obs_id => 'obs-test-sr-1'::text,
        p_incident_id => 'inc-test-sr-1'::text,
        p_field_key => 'OBSERVED_QUANTITY'::text,
        p_value_json => '{"quantity": 47}'::jsonb,
        p_source_turn_id => NULL::text,
        p_source_quote => 'observed 47 cartons'::text,
        p_speaker_role => 'RECEIVER'::text,
        p_confidence => 0.98::double precision,
        p_confirmed => TRUE::boolean,
        p_exc_id => 'exc-test-sr-1'::text,
        p_shipment_item_id => 'item-po44891-1'::text,
        p_exc_type => 'SHORTAGE'::text,
        p_expected_qty => 48::integer,
        p_observed_qty => 47::integer,
        p_delta => -1::integer,
        p_audit_id => 'audit-test-sr-1'::text,
        p_actor => 'RECEIVER'::text,
        p_event_type => 'OBSERVATION_RECORDED'::text,
        p_audit_payload => '{"event": "observation_recorded"}'::jsonb
      ) AS result;
    `);

    expect(res.rows).toHaveLength(1);
    const result = res.rows[0].result;
    expect(result.status).toBe("COMMITTED");
    expect(result.observation_id).toBe("obs-test-sr-1");
    expect(result.incident_id).toBe("inc-test-sr-1");

    // 3. Verify database state
    const obsCheck = await adminClient.query(`SELECT id, field_key FROM observations WHERE id = 'obs-test-sr-1'`);
    expect(obsCheck.rows).toHaveLength(1);

    const excCheck = await adminClient.query(`SELECT id, delta, type FROM exceptions WHERE id = 'exc-test-sr-1'`);
    expect(excCheck.rows[0]).toEqual({ id: "exc-test-sr-1", delta: -1, type: "SHORTAGE" });

    const auditCheck = await adminClient.query(`SELECT id, event_type FROM audit_events WHERE id = 'audit-test-sr-1'`);
    expect(auditCheck.rows[0]).toEqual({ id: "audit-test-sr-1", event_type: "OBSERVATION_RECORDED" });
  });

  it("anon: record_observation_atomic returns PostgreSQL insufficient_privilege / permission denied (NOT function not found)", async () => {
    let thrownError: any = null;

    try {
      await anonClient.query(`
        SELECT record_observation_atomic(
          p_obs_id => 'obs-test-anon-1'::text,
          p_incident_id => 'inc-test-sr-1'::text,
          p_field_key => 'OBSERVED_QUANTITY'::text,
          p_value_json => '{"quantity": 47}'::jsonb,
          p_source_turn_id => NULL::text,
          p_source_quote => 'unauthorized observation attempt'::text,
          p_speaker_role => 'RECEIVER'::text,
          p_confidence => 0.98::double precision,
          p_confirmed => TRUE::boolean,
          p_exc_id => NULL::text,
          p_shipment_item_id => NULL::text,
          p_exc_type => NULL::text,
          p_expected_qty => NULL::integer,
          p_observed_qty => NULL::integer,
          p_delta => NULL::integer,
          p_audit_id => 'audit-test-anon-1'::text,
          p_actor => 'RECEIVER'::text,
          p_event_type => 'OBSERVATION_RECORDED'::text,
          p_audit_payload => '{}'::jsonb
        );
      `);
    } catch (err: any) {
      thrownError = err;
    }

    expect(thrownError).not.toBeNull();
    // Must be PostgreSQL 42501 insufficient_privilege
    expect(thrownError.code).toBe("42501");
    expect(thrownError.message).toMatch(/permission denied for function record_observation_atomic/i);

    // Strictly ensure it is NOT a false-pass due to missing function
    expect(thrownError.code).not.toBe("42883"); // undefined_function
    expect(thrownError.code).not.toBe("PGRST202");
    expect(thrownError.message).not.toMatch(/does not exist/i);
    expect(thrownError.message).not.toMatch(/schema cache/i);
  });

  it("service_role: record_attestation_atomic is executable and commits single-transaction attestation", async () => {
    const res = await serviceRoleClient.query(`
      SELECT record_attestation_atomic(
        p_att_id => 'att-test-sr-1'::text,
        p_incident_id => 'inc-test-sr-1'::text,
        p_exception_id => 'exc-test-sr-1'::text,
        p_party_role => 'DRIVER'::text,
        p_position => 'DISPUTE'::text,
        p_source_turn_id => NULL::text,
        p_new_agreement_status => 'DISPUTED'::text,
        p_audit_id => 'audit-test-sr-2'::text,
        p_audit_payload => '{"position": "DISPUTE"}'::jsonb
      ) AS result;
    `);

    expect(res.rows).toHaveLength(1);
    const result = res.rows[0].result;
    expect(result.status).toBe("COMMITTED");
    expect(result.resulting_status).toBe("DISPUTED");

    // Verify exception status updated in DB
    const excCheck = await adminClient.query(`SELECT agreement_status FROM exceptions WHERE id = 'exc-test-sr-1'`);
    expect(excCheck.rows[0].agreement_status).toBe("DISPUTED");

    // Verify attestation inserted in DB
    const attCheck = await adminClient.query(`SELECT id, position FROM attestations WHERE id = 'att-test-sr-1'`);
    expect(attCheck.rows[0]).toEqual({ id: "att-test-sr-1", position: "DISPUTE" });
  });

  it("anon: record_attestation_atomic returns PostgreSQL insufficient_privilege / permission denied (NOT function not found)", async () => {
    let thrownError: any = null;

    try {
      await anonClient.query(`
        SELECT record_attestation_atomic(
          p_att_id => 'att-test-anon-1'::text,
          p_incident_id => 'inc-test-sr-1'::text,
          p_exception_id => 'exc-test-sr-1'::text,
          p_party_role => 'DRIVER'::text,
          p_position => 'DISPUTE'::text,
          p_source_turn_id => NULL::text,
          p_new_agreement_status => 'DISPUTED'::text,
          p_audit_id => 'audit-test-anon-2'::text,
          p_audit_payload => '{}'::jsonb
        );
      `);
    } catch (err: any) {
      thrownError = err;
    }

    expect(thrownError).not.toBeNull();
    // Must be PostgreSQL 42501 insufficient_privilege
    expect(thrownError.code).toBe("42501");
    expect(thrownError.message).toMatch(/permission denied for function record_attestation_atomic/i);

    // Strictly ensure it is NOT a false-pass due to missing function
    expect(thrownError.code).not.toBe("42883"); // undefined_function
    expect(thrownError.code).not.toBe("PGRST202");
    expect(thrownError.message).not.toMatch(/does not exist/i);
    expect(thrownError.message).not.toMatch(/schema cache/i);
  });
});

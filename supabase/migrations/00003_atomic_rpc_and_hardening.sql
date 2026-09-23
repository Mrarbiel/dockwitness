-- Migration: 00003_atomic_rpc_and_hardening.sql
-- Description: Revoke anonymous direct reads on sensitive evidence tables and add atomic RPC procedures

-- -----------------------------------------------------------------------------
-- 1. DATABASE PRIVACY & RLS POLICIES (R5)
-- Revoke direct anonymous SELECT on sensitive evidence tables.
-- Public anon users can only read shipments and shipment_items (manifests).
-- All evidence access is mediated securely via Next.js server route handlers.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public Read incidents" ON incidents;
DROP POLICY IF EXISTS "Public Read exceptions" ON exceptions;
DROP POLICY IF EXISTS "Public Read transcript_turns" ON transcript_turns;
DROP POLICY IF EXISTS "Public Read observations" ON observations;
DROP POLICY IF EXISTS "Public Read evidence" ON evidence;
DROP POLICY IF EXISTS "Public Read attestations" ON attestations;
DROP POLICY IF EXISTS "Public Read audit_events" ON audit_events;

-- Service role bypasses RLS in Supabase, but explicit policies ensure authenticated server clients have access
CREATE POLICY "Service Role Full Access incidents" ON incidents FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access exceptions" ON exceptions FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access transcript_turns" ON transcript_turns FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access observations" ON observations FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access evidence" ON evidence FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access attestations" ON attestations FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access audit_events" ON audit_events FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 2. ATOMIC OBSERVATION PERSISTENCE (R9)
-- Atomically creates/updates observation, exception, and audit event in a single transaction.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_observation_atomic(
  p_obs_id TEXT,
  p_incident_id TEXT,
  p_field_key TEXT,
  p_value_json JSONB,
  p_source_turn_id TEXT,
  p_source_quote TEXT,
  p_speaker_role TEXT,
  p_confidence DOUBLE PRECISION,
  p_confirmed BOOLEAN,
  p_exc_id TEXT,
  p_shipment_item_id TEXT,
  p_exc_type TEXT,
  p_expected_qty INTEGER,
  p_observed_qty INTEGER,
  p_delta INTEGER,
  p_audit_id TEXT,
  p_actor TEXT,
  p_event_type TEXT,
  p_audit_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_exc_id TEXT;
  v_result JSONB;
BEGIN
  -- 1. Insert observation record
  INSERT INTO observations (
    id, incident_id, field_key, value_json, source_turn_id,
    source_quote, speaker_role, confidence, confirmed, created_at
  ) VALUES (
    p_obs_id, p_incident_id, p_field_key, p_value_json, p_source_turn_id,
    p_source_quote, p_speaker_role, p_confidence, p_confirmed, NOW()
  );

  -- 2. Create or update exception if discrepancy exists
  IF p_exc_type IS NOT NULL AND p_exc_type <> '' THEN
    SELECT id INTO v_existing_exc_id
    FROM exceptions
    WHERE incident_id = p_incident_id AND type IN ('SHORTAGE', 'OVERAGE')
    LIMIT 1;

    IF v_existing_exc_id IS NOT NULL THEN
      UPDATE exceptions
      SET
        observed_qty = p_observed_qty,
        delta = p_delta,
        type = p_exc_type,
        agreement_status = 'PENDING_REVIEW'
      WHERE id = v_existing_exc_id;
    ELSE
      INSERT INTO exceptions (
        id, incident_id, shipment_item_id, type, expected_qty,
        observed_qty, delta, agreement_status, created_at
      ) VALUES (
        p_exc_id, p_incident_id, p_shipment_item_id, p_exc_type, p_expected_qty,
        p_observed_qty, p_delta, 'PENDING_REVIEW', NOW()
      );
    END IF;
  END IF;

  -- 3. Append immutable audit event
  INSERT INTO audit_events (
    id, incident_id, actor, event_type, payload_json, created_at
  ) VALUES (
    p_audit_id, p_incident_id, p_actor, p_event_type, p_audit_payload, NOW()
  );

  v_result := jsonb_build_object(
    'observation_id', p_obs_id,
    'incident_id', p_incident_id,
    'status', 'COMMITTED'
  );

  RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. ATOMIC ATTESTATION PERSISTENCE (R9)
-- Atomically creates attestation, updates exception agreement_status, and appends audit event.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_attestation_atomic(
  p_att_id TEXT,
  p_incident_id TEXT,
  p_exception_id TEXT,
  p_party_role TEXT,
  p_position TEXT,
  p_source_turn_id TEXT,
  p_new_agreement_status TEXT,
  p_audit_id TEXT,
  p_audit_payload JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- 1. Insert attestation record
  INSERT INTO attestations (
    id, incident_id, exception_id, party_role, position, source_turn_id, created_at
  ) VALUES (
    p_att_id, p_incident_id, p_exception_id, p_party_role, p_position, p_source_turn_id, NOW()
  );

  -- 2. Update exception agreement_status
  UPDATE exceptions
  SET agreement_status = p_new_agreement_status
  WHERE id = p_exception_id AND incident_id = p_incident_id;

  -- 3. Append immutable audit event
  INSERT INTO audit_events (
    id, incident_id, actor, event_type, payload_json, created_at
  ) VALUES (
    p_audit_id, p_incident_id, p_party_role, 'ATTESTATION_RECORDED', p_audit_payload, NOW()
  );

  v_result := jsonb_build_object(
    'attestation_id', p_att_id,
    'exception_id', p_exception_id,
    'resulting_status', p_new_agreement_status,
    'status', 'COMMITTED'
  );

  RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. PRIVILEGE RESTRICTION FOR SECURITY DEFINER FUNCTIONS
-- Explicitly revoke execution from public roles to prevent unauthenticated data API write bypass
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION record_observation_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_observation_atomic TO service_role;

REVOKE ALL ON FUNCTION record_attestation_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_attestation_atomic TO service_role;


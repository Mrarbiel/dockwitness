-- =============================================================================
-- Migration: 00004_voice_damage_and_agreement_consistency.sql
-- Description: Dedicated atomic damage observation RPC and agreement hardening
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ATOMIC DAMAGE OBSERVATION RPC
-- Atomically creates/updates damage observation, damage exception, and audit event.
-- Preserves existing SHORTAGE/OVERAGE exceptions without clobbering.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_damage_observation_atomic(
  p_obs_id TEXT,
  p_incident_id TEXT,
  p_damage_desc TEXT,
  p_source_turn_id TEXT,
  p_source_quote TEXT,
  p_speaker_role TEXT,
  p_confidence DOUBLE PRECISION,
  p_confirmed BOOLEAN,
  p_exc_id TEXT,
  p_shipment_item_id TEXT,
  p_carton_reference TEXT,
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
  v_expected_qty INTEGER;
  v_item_id TEXT := p_shipment_item_id;
  v_result JSONB;
BEGIN
  -- 1. Insert or update observation record for damage provenance
  INSERT INTO observations (
    id, incident_id, field_key, value_json, source_turn_id,
    source_quote, speaker_role, confidence, confirmed, created_at
  ) VALUES (
    p_obs_id,
    p_incident_id,
    'damage_reported',
    jsonb_build_object(
      'damageDescription', p_damage_desc,
      'cartonReference', p_carton_reference,
      'condition', p_damage_desc
    ),
    p_source_turn_id,
    p_source_quote,
    COALESCE(p_speaker_role, 'RECEIVER'),
    COALESCE(p_confidence, 1.0),
    COALESCE(p_confirmed, true),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    value_json = EXCLUDED.value_json,
    source_quote = EXCLUDED.source_quote,
    confidence = EXCLUDED.confidence,
    confirmed = EXCLUDED.confirmed;

  -- 2. Lookup manifest expected quantity for the item if available
  IF v_item_id IS NOT NULL THEN
    SELECT expected_qty INTO v_expected_qty
    FROM shipment_items
    WHERE id = v_item_id;
  END IF;

  IF v_expected_qty IS NULL THEN
    SELECT si.id, si.expected_qty INTO v_item_id, v_expected_qty
    FROM shipment_items si
    JOIN incidents inc ON inc.shipment_id = si.shipment_id
    WHERE inc.id = p_incident_id
    LIMIT 1;
  END IF;

  IF v_expected_qty IS NULL THEN
    v_expected_qty := 48;
  END IF;

  -- 3. Upsert DAMAGE exception (strictly isolated from SHORTAGE/OVERAGE)
  SELECT id INTO v_existing_exc_id
  FROM exceptions
  WHERE incident_id = p_incident_id AND type = 'DAMAGE'
  LIMIT 1;

  IF v_existing_exc_id IS NOT NULL THEN
    UPDATE exceptions
    SET
      damage_description = p_damage_desc,
      agreement_status = COALESCE(agreement_status, 'PENDING_REVIEW')
    WHERE id = v_existing_exc_id;
  ELSE
    INSERT INTO exceptions (
      id, incident_id, shipment_item_id, type, expected_qty,
      observed_qty, delta, damage_description, agreement_status, created_at
    ) VALUES (
      p_exc_id,
      p_incident_id,
      COALESCE(v_item_id, p_shipment_item_id, 'item-default'),
      'DAMAGE',
      v_expected_qty,
      v_expected_qty,
      0,
      p_damage_desc,
      'PENDING_REVIEW',
      NOW()
    );
  END IF;

  -- 4. Append immutable audit event
  INSERT INTO audit_events (
    id, incident_id, actor, event_type, payload_json, created_at
  ) VALUES (
    p_audit_id,
    p_incident_id,
    COALESCE(p_actor, 'RECEIVER'),
    COALESCE(p_event_type, 'OBSERVATION_RECORDED'),
    COALESCE(p_audit_payload, jsonb_build_object(
      'fieldKey', 'damage_reported',
      'damageDescription', p_damage_desc,
      'cartonReference', p_carton_reference
    )),
    NOW()
  );

  v_result := jsonb_build_object(
    'observation_id', p_obs_id,
    'exception_id', COALESCE(v_existing_exc_id, p_exc_id),
    'incident_id', p_incident_id,
    'status', 'COMMITTED'
  );

  RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. SECURITY & PERMISSIONS HARDENING
-- Revoke execution from anonymous/public users; grant strictly to service_role.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.record_damage_observation_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_damage_observation_atomic TO service_role;

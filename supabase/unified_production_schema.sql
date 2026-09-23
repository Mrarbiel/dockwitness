-- =============================================================================
-- DockWitness: Unified Production Database Schema & Seed Script
-- Migrations Unified: 00001_initial_schema.sql, 00002_immutability_and_rls.sql, 00003_atomic_rpc_and_hardening.sql
-- =============================================================================

-- =============================================================================
-- PHASE 1: CORE TABLES DDL
-- =============================================================================

-- 1. Shipments Table
CREATE TABLE IF NOT EXISTS public.shipments (
  id TEXT PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  bol_number TEXT NOT NULL,
  carrier_name TEXT NOT NULL,
  trailer_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Shipment Items Table
CREATE TABLE IF NOT EXISTS public.shipment_items (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  description TEXT NOT NULL,
  expected_qty INTEGER NOT NULL,
  unit TEXT NOT NULL DEFAULT 'cartons',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Incidents Table
CREATE TABLE IF NOT EXISTS public.incidents (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  incident_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  receiver_name TEXT,
  driver_name TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 4. Exceptions Table
CREATE TABLE IF NOT EXISTS public.exceptions (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  shipment_item_id TEXT NOT NULL REFERENCES public.shipment_items(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'SHORTAGE', 'OVERAGE', 'DAMAGE'
  expected_qty INTEGER NOT NULL,
  observed_qty INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  damage_description TEXT,
  agreement_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Transcript Turns Table
CREATE TABLE IF NOT EXISTS public.transcript_turns (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  speaker_role TEXT NOT NULL, -- 'RECEIVER', 'DRIVER'
  text TEXT NOT NULL,
  start_ms INTEGER DEFAULT 0,
  end_ms INTEGER DEFAULT 0,
  is_final BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Observations Table (Fact Provenance)
CREATE TABLE IF NOT EXISTS public.observations (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  value_json JSONB NOT NULL,
  source_turn_id TEXT REFERENCES public.transcript_turns(id) ON DELETE SET NULL,
  source_quote TEXT NOT NULL,
  speaker_role TEXT NOT NULL,
  confidence DOUBLE PRECISION DEFAULT 1.0,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Evidence Table (Photos / Audio)
CREATE TABLE IF NOT EXISTS public.evidence (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'PHOTO', 'AUDIO', 'DOCUMENT'
  storage_path TEXT NOT NULL,
  description TEXT,
  captured_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Attestations Table
CREATE TABLE IF NOT EXISTS public.attestations (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  exception_id TEXT NOT NULL REFERENCES public.exceptions(id) ON DELETE CASCADE,
  party_role TEXT NOT NULL, -- 'RECEIVER', 'DRIVER'
  position TEXT NOT NULL, -- 'CONFIRM', 'DISPUTE', 'NO_KNOWLEDGE', 'NOT_ASKED', 'REFUSED_TO_ATTEST', 'DRIVER_UNAVAILABLE'
  source_turn_id TEXT REFERENCES public.transcript_turns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Audit Events Table (Append-Only)
CREATE TABLE IF NOT EXISTS public.audit_events (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- PHASE 2: FOREIGN KEY INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment_id ON public.shipment_items(shipment_id);
CREATE INDEX IF NOT EXISTS idx_incidents_shipment_id ON public.incidents(shipment_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_incident_id ON public.exceptions(incident_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_shipment_item_id ON public.exceptions(shipment_item_id);
CREATE INDEX IF NOT EXISTS idx_turns_incident_id ON public.transcript_turns(incident_id);
CREATE INDEX IF NOT EXISTS idx_observations_incident_id ON public.observations(incident_id);
CREATE INDEX IF NOT EXISTS idx_observations_source_turn_id ON public.observations(source_turn_id);
CREATE INDEX IF NOT EXISTS idx_evidence_incident_id ON public.evidence(incident_id);
CREATE INDEX IF NOT EXISTS idx_attestations_incident_id ON public.attestations(incident_id);
CREATE INDEX IF NOT EXISTS idx_attestations_exception_id ON public.attestations(exception_id);
CREATE INDEX IF NOT EXISTS idx_attestations_source_turn_id ON public.attestations(source_turn_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_incident_id ON public.audit_events(incident_id);

-- =============================================================================
-- PHASE 3: APPEND-ONLY IMMUTABILITY TRIGGER
-- =============================================================================

CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events table is strictly append-only. Updates and deletes are forbidden.';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_immutable ON public.audit_events;
CREATE TRIGGER trg_audit_events_immutable
BEFORE UPDATE OR DELETE ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

-- =============================================================================
-- PHASE 4: ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcript_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- Public read access for manifest inspection (Gate 1)
CREATE POLICY "Public Read shipments" ON public.shipments FOR SELECT USING (true);
CREATE POLICY "Public Read shipment_items" ON public.shipment_items FOR SELECT USING (true);

-- Authenticated and Service Role full access to incident workflows
CREATE POLICY "Service Role Full Access incidents" ON public.incidents FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access exceptions" ON public.exceptions FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access transcript_turns" ON public.transcript_turns FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access observations" ON public.observations FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access evidence" ON public.evidence FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access attestations" ON public.attestations FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access audit_events" ON public.audit_events FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);

-- Public read for incidents/audit review on judge demo views
CREATE POLICY "Public Read incidents" ON public.incidents FOR SELECT USING (true);
CREATE POLICY "Public Read exceptions" ON public.exceptions FOR SELECT USING (true);
CREATE POLICY "Public Read transcript_turns" ON public.transcript_turns FOR SELECT USING (true);
CREATE POLICY "Public Read observations" ON public.observations FOR SELECT USING (true);
CREATE POLICY "Public Read evidence" ON public.evidence FOR SELECT USING (true);
CREATE POLICY "Public Read attestations" ON public.attestations FOR SELECT USING (true);
CREATE POLICY "Public Read audit_events" ON public.audit_events FOR SELECT USING (true);

-- =============================================================================
-- PHASE 5: SECURITY DEFINER ATOMIC RPC PROCEDURES
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_observation_atomic(
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
  INSERT INTO public.observations (
    id, incident_id, field_key, value_json, source_turn_id,
    source_quote, speaker_role, confidence, confirmed, created_at
  ) VALUES (
    p_obs_id, p_incident_id, p_field_key, p_value_json, p_source_turn_id,
    p_source_quote, p_speaker_role, p_confidence, p_confirmed, NOW()
  );

  -- 2. Create or update exception if discrepancy exists
  IF p_exc_type IS NOT NULL AND p_exc_type <> '' THEN
    SELECT id INTO v_existing_exc_id
    FROM public.exceptions
    WHERE incident_id = p_incident_id AND type IN ('SHORTAGE', 'OVERAGE')
    LIMIT 1;

    IF v_existing_exc_id IS NOT NULL THEN
      UPDATE public.exceptions
      SET
        observed_qty = p_observed_qty,
        delta = p_delta,
        type = p_exc_type,
        agreement_status = 'PENDING_REVIEW'
      WHERE id = v_existing_exc_id;
    ELSE
      INSERT INTO public.exceptions (
        id, incident_id, shipment_item_id, type, expected_qty,
        observed_qty, delta, agreement_status, created_at
      ) VALUES (
        p_exc_id, p_incident_id, p_shipment_item_id, p_exc_type, p_expected_qty,
        p_observed_qty, p_delta, 'PENDING_REVIEW', NOW()
      );
    END IF;
  END IF;

  -- 3. Append immutable audit event
  INSERT INTO public.audit_events (
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

CREATE OR REPLACE FUNCTION public.record_attestation_atomic(
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
  INSERT INTO public.attestations (
    id, incident_id, exception_id, party_role, position, source_turn_id, created_at
  ) VALUES (
    p_att_id, p_incident_id, p_exception_id, p_party_role, p_position, p_source_turn_id, NOW()
  );

  -- 2. Update exception agreement_status
  UPDATE public.exceptions
  SET agreement_status = p_new_agreement_status
  WHERE id = p_exception_id AND incident_id = p_incident_id;

  -- 3. Append immutable audit event
  INSERT INTO public.audit_events (
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

-- Grant execution to authenticated, anon, and service_role for API mediation
GRANT EXECUTE ON FUNCTION public.record_observation_atomic TO service_role, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.record_attestation_atomic TO service_role, authenticated, anon;

-- =============================================================================
-- PHASE 6: STORAGE BUCKET FOR EVIDENCE PHOTOS
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('evidence', 'evidence', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "Public Read evidence storage" ON storage.objects
FOR SELECT USING (bucket_id = 'evidence');

CREATE POLICY "Service Role Full Access evidence storage" ON storage.objects
FOR ALL TO service_role USING (bucket_id = 'evidence') WITH CHECK (bucket_id = 'evidence');

-- =============================================================================
-- PHASE 7: SEED CANONICAL SHIPMENT DATA (5 SEED POS)
-- =============================================================================

INSERT INTO public.shipments (id, po_number, bol_number, carrier_name, trailer_number, status)
VALUES
  ('shipment-po44880', '44880', 'NS-90270', 'NorthStar Freight', 'NST-2100', 'COMPLETED'),
  ('shipment-po44891', '44891', 'NS-90283', 'NorthStar Freight', 'NST-2208', 'IN_PROGRESS'),
  ('shipment-po44902', '44902', 'NS-90295', 'Midwest Express', 'MWE-4411', 'PENDING'),
  ('shipment-po44913', '44913', 'NS-90310', 'Apex Logistics', 'APX-8820', 'PENDING'),
  ('shipment-po44924', '44924', 'NS-90325', 'Eagle Freight', 'EAG-1090', 'PENDING')
ON CONFLICT (po_number) DO UPDATE SET
  bol_number = EXCLUDED.bol_number,
  carrier_name = EXCLUDED.carrier_name,
  trailer_number = EXCLUDED.trailer_number;

INSERT INTO public.shipment_items (id, shipment_id, sku, description, expected_qty, unit)
VALUES
  ('item-po44880-1', 'shipment-po44880', 'AX-10', 'Heavy Duty Bearings', 50, 'cartons'),
  ('item-po44891-1', 'shipment-po44891', 'AX-17', 'Industrial Filter Cartons', 48, 'cartons'),
  ('item-po44902-1', 'shipment-po44902', 'BX-22', 'Hydraulic Seals', 30, 'cartons'),
  ('item-po44913-1', 'shipment-po44913', 'CX-40', 'Precision Fasteners', 60, 'cartons'),
  ('item-po44924-1', 'shipment-po44924', 'DX-99', 'Electronic Sensor Packs', 25, 'cartons')
ON CONFLICT (id) DO UPDATE SET
  expected_qty = EXCLUDED.expected_qty,
  description = EXCLUDED.description;

-- =============================================================================
-- DockWitness: Supabase Advisor Remediation & Demo Database Alignment Script
-- Authoritative migrations: 00001_initial_schema.sql, 00002_immutability_and_rls.sql, 00003_atomic_rpc_and_hardening.sql
-- Canonical tables: shipments, shipment_items, incidents, exceptions,
--                  transcript_turns, observations, evidence, attestations, audit_events
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. SECURITY ADVISOR: Set explicit search_path on prevent_audit_mutation()
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 2. PERFORMANCE ADVISOR: Ensure all Foreign Key Indexes Exist
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 3. SEED 5 CANONICAL SHIPMENTS (Exact match with lib/seeds/shipments.ts & seed.sql)
-- -----------------------------------------------------------------------------
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
  sku = EXCLUDED.sku,
  description = EXCLUDED.description,
  expected_qty = EXCLUDED.expected_qty,
  unit = EXCLUDED.unit;

-- Verification query
SELECT 'Remediation completed successfully' AS status,
       (SELECT COUNT(*) FROM public.shipments) AS shipments_count,
       (SELECT COUNT(*) FROM public.shipment_items) AS items_count,
       (SELECT COUNT(*) FROM public.incidents) AS incidents_count,
       (SELECT COUNT(*) FROM public.audit_events) AS audit_events_count;

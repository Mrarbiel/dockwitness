-- Migration: 00002_immutability_and_rls.sql
-- Description: Enforce append-only immutability trigger on audit_events and configure RLS

-- Immutability trigger on audit_events
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_events table is strictly append-only. Updates and deletes are forbidden.';
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_events_immutable ON audit_events;
CREATE TRIGGER trg_audit_events_immutable
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

-- Enable RLS
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcript_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE attestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

-- Public read access for demo purposes
CREATE POLICY "Public Read shipments" ON shipments FOR SELECT USING (true);
CREATE POLICY "Public Read shipment_items" ON shipment_items FOR SELECT USING (true);
CREATE POLICY "Public Read incidents" ON incidents FOR SELECT USING (true);
CREATE POLICY "Public Read exceptions" ON exceptions FOR SELECT USING (true);
CREATE POLICY "Public Read transcript_turns" ON transcript_turns FOR SELECT USING (true);
CREATE POLICY "Public Read observations" ON observations FOR SELECT USING (true);
CREATE POLICY "Public Read evidence" ON evidence FOR SELECT USING (true);
CREATE POLICY "Public Read attestations" ON attestations FOR SELECT USING (true);
CREATE POLICY "Public Read audit_events" ON audit_events FOR SELECT USING (true);

-- Anonymous writes are disabled to protect public demo integrity.
-- All database mutations route safely through Next.js server route handlers using service_role key.

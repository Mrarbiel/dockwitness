-- Migration: 00001_initial_schema.sql
-- Description: Core schema for DockWitness freight receiving evidence system

-- 1. Shipments Table
CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  po_number TEXT NOT NULL UNIQUE,
  bol_number TEXT NOT NULL,
  carrier_name TEXT NOT NULL,
  trailer_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Shipment Items
CREATE TABLE IF NOT EXISTS shipment_items (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  description TEXT NOT NULL,
  expected_qty INTEGER NOT NULL,
  unit TEXT NOT NULL DEFAULT 'cartons',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Incidents
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY,
  shipment_id TEXT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  incident_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  receiver_name TEXT,
  driver_name TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 4. Exceptions
CREATE TABLE IF NOT EXISTS exceptions (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  shipment_item_id TEXT NOT NULL REFERENCES shipment_items(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'SHORTAGE', 'OVERAGE', 'DAMAGE'
  expected_qty INTEGER NOT NULL,
  observed_qty INTEGER NOT NULL,
  delta INTEGER NOT NULL,
  damage_description TEXT,
  agreement_status TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Transcript Turns
CREATE TABLE IF NOT EXISTS transcript_turns (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  speaker_role TEXT NOT NULL, -- 'RECEIVER', 'DRIVER'
  text TEXT NOT NULL,
  start_ms INTEGER DEFAULT 0,
  end_ms INTEGER DEFAULT 0,
  is_final BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Observations (Fact Provenance)
CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  value_json JSONB NOT NULL,
  source_turn_id TEXT REFERENCES transcript_turns(id) ON DELETE SET NULL,
  source_quote TEXT NOT NULL,
  speaker_role TEXT NOT NULL,
  confidence DOUBLE PRECISION DEFAULT 1.0,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Evidence (Photos / Audio)
CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'PHOTO', 'AUDIO', 'DOCUMENT'
  storage_path TEXT NOT NULL,
  description TEXT,
  captured_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Attestations
CREATE TABLE IF NOT EXISTS attestations (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  exception_id TEXT NOT NULL REFERENCES exceptions(id) ON DELETE CASCADE,
  party_role TEXT NOT NULL, -- 'RECEIVER', 'DRIVER'
  position TEXT NOT NULL, -- 'CONFIRM', 'DISPUTE', 'NO_KNOWLEDGE', 'NOT_ASKED'
  source_turn_id TEXT REFERENCES transcript_turns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Audit Events (Append-Only)
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance & foreign key navigation
CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment_id ON shipment_items(shipment_id);
CREATE INDEX IF NOT EXISTS idx_incidents_shipment_id ON incidents(shipment_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_incident_id ON exceptions(incident_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_shipment_item_id ON exceptions(shipment_item_id);
CREATE INDEX IF NOT EXISTS idx_turns_incident_id ON transcript_turns(incident_id);
CREATE INDEX IF NOT EXISTS idx_observations_incident_id ON observations(incident_id);
CREATE INDEX IF NOT EXISTS idx_observations_source_turn_id ON observations(source_turn_id);
CREATE INDEX IF NOT EXISTS idx_evidence_incident_id ON evidence(incident_id);
CREATE INDEX IF NOT EXISTS idx_attestations_incident_id ON attestations(incident_id);
CREATE INDEX IF NOT EXISTS idx_attestations_exception_id ON attestations(exception_id);
CREATE INDEX IF NOT EXISTS idx_attestations_source_turn_id ON attestations(source_turn_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_incident_id ON audit_events(incident_id);

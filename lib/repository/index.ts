import {
  Shipment,
  Incident,
  TranscriptTurnRecord,
  DiscrepancyException,
  ObservationRecord,
  EvidenceRecord,
  AttestationRecord,
  AuditEventRecord,
  AgreementStatus,
} from "../types";
import { SEED_SHIPMENTS } from "../seeds/shipments";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface DataRepository {
  // Shipments (Read-only manifests)
  getShipments(): Promise<Shipment[]>;
  getShipment(idOrPo: string): Promise<Shipment | null>;

  // Incidents (Lifecycle management)
  getIncidents(filters?: { shipmentId?: string; status?: string }): Promise<Incident[]>;
  getIncident(id: string): Promise<Incident | null>;
  createIncident(incident: Incident): Promise<Incident>;
  updateIncident(id: string, updates: Partial<Incident>): Promise<Incident | null>;

  // Speech Transcript Turns
  saveTurn(turn: TranscriptTurnRecord): Promise<TranscriptTurnRecord>;
  getTurns(incidentId: string): Promise<TranscriptTurnRecord[]>;

  // Exceptions & Candidate Discrepancies
  createException(exception: DiscrepancyException): Promise<DiscrepancyException>;
  getExceptions(incidentId: string): Promise<DiscrepancyException[]>;
  updateException(id: string, updates: Partial<DiscrepancyException>): Promise<DiscrepancyException | null>;

  // Fact Observations with Quote Provenance
  saveObservation(observation: ObservationRecord): Promise<ObservationRecord>;
  getObservations(incidentId: string): Promise<ObservationRecord[]>;

  // Evidence Attachments (Photos / Audio)
  saveEvidence(evidence: EvidenceRecord): Promise<EvidenceRecord>;
  getEvidence(incidentId: string): Promise<EvidenceRecord[]>;
  getEvidenceById(id: string): Promise<EvidenceRecord | null>;

  // Party Attestations (Receiver & Driver positions)
  saveAttestation(attestation: AttestationRecord): Promise<AttestationRecord>;
  getAttestations(incidentId: string): Promise<AttestationRecord[]>;

  // Audit Events Ledger (Append-only)
  appendAuditEvent(event: AuditEventRecord): Promise<AuditEventRecord>;
  getAuditEvents(incidentId: string): Promise<AuditEventRecord[]>;

  // Atomic Multi-Table Operations (Single-transaction persistence)
  recordObservationAtomic(params: {
    observation: ObservationRecord;
    exception?: DiscrepancyException | null;
    actor: string;
    auditEvent: AuditEventRecord;
  }): Promise<{ observation: ObservationRecord; exception: DiscrepancyException | null; auditEvent: AuditEventRecord }>;

  recordAttestationAtomic(params: {
    attestation: AttestationRecord;
    exceptionId: string;
    newAgreementStatus: AgreementStatus;
    auditEvent: AuditEventRecord;
  }): Promise<{ attestation: AttestationRecord; newAgreementStatus: AgreementStatus; auditEvent: AuditEventRecord }>;

  recordDamageObservationAtomic(params: {
    observationId: string;
    incidentId: string;
    damageDescription: string;
    sourceTurnId?: string | null;
    sourceQuote: string;
    speakerRole?: string;
    confidence?: number;
    confirmed?: boolean;
    exceptionId?: string;
    shipmentItemId?: string;
    cartonReference?: string | null;
    auditId?: string;
    actor?: string;
    eventType?: string;
    auditPayload?: Record<string, unknown>;
  }): Promise<{
    observation: ObservationRecord;
    exception: DiscrepancyException;
    auditEvent: AuditEventRecord;
  }>;
}

export class MockStoreRepository implements DataRepository {
  private shipments: Shipment[] = JSON.parse(JSON.stringify(SEED_SHIPMENTS));
  private incidents: Map<string, Incident> = new Map();
  private turns: Map<string, TranscriptTurnRecord[]> = new Map();
  private exceptions: Map<string, DiscrepancyException[]> = new Map();
  private observations: Map<string, ObservationRecord[]> = new Map();
  private evidence: Map<string, EvidenceRecord[]> = new Map();
  private attestations: Map<string, AttestationRecord[]> = new Map();
  private auditEvents: Map<string, AuditEventRecord[]> = new Map();

  async getShipments(): Promise<Shipment[]> {
    return JSON.parse(JSON.stringify(this.shipments));
  }

  async getShipment(idOrPo: string): Promise<Shipment | null> {
    if (!idOrPo || !idOrPo.trim()) return null;
    const cleanKey = idOrPo.trim().toLowerCase().replace(/^shipment-/, "").replace(/^po-?/, "");
    if (!cleanKey) return null;
    const found = this.shipments.find(
      (s) =>
        s.id.toLowerCase() === idOrPo.trim().toLowerCase() ||
        s.poNumber.toLowerCase() === idOrPo.trim().toLowerCase() ||
        s.poNumber.toLowerCase() === cleanKey ||
        s.id.toLowerCase().includes(cleanKey)
    );
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async getIncidents(filters?: { shipmentId?: string; status?: string }): Promise<Incident[]> {
    let result = Array.from(this.incidents.values());
    if (filters?.shipmentId) {
      result = result.filter((inc) => inc.shipmentId === filters.shipmentId);
    }
    if (filters?.status) {
      result = result.filter((inc) => inc.status === filters.status);
    }
    result.sort((a, b) => {
      const timeA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const timeB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return timeB - timeA;
    });
    return JSON.parse(JSON.stringify(result));
  }

  async getIncident(id: string): Promise<Incident | null> {
    const inc = this.incidents.get(id);
    return inc ? JSON.parse(JSON.stringify(inc)) : null;
  }

  async createIncident(incident: Incident): Promise<Incident> {
    const cloned = JSON.parse(JSON.stringify(incident));
    this.incidents.set(cloned.id, cloned);
    return cloned;
  }

  async updateIncident(id: string, updates: Partial<Incident>): Promise<Incident | null> {
    const existing = this.incidents.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates };
    this.incidents.set(id, updated);
    return JSON.parse(JSON.stringify(updated));
  }

  async saveTurn(turn: TranscriptTurnRecord): Promise<TranscriptTurnRecord> {
    const cloned = JSON.parse(JSON.stringify(turn));
    const list = this.turns.get(turn.incidentId) || [];
    list.push(cloned);
    this.turns.set(turn.incidentId, list);
    return cloned;
  }

  async getTurns(incidentId: string): Promise<TranscriptTurnRecord[]> {
    const list = this.turns.get(incidentId) || [];
    return JSON.parse(JSON.stringify(list));
  }

  async createException(exception: DiscrepancyException): Promise<DiscrepancyException> {
    const cloned = JSON.parse(JSON.stringify(exception));
    const list = this.exceptions.get(exception.incidentId) || [];
    list.push(cloned);
    this.exceptions.set(exception.incidentId, list);
    return cloned;
  }

  async getExceptions(incidentId: string): Promise<DiscrepancyException[]> {
    const list = this.exceptions.get(incidentId) || [];
    return JSON.parse(JSON.stringify(list));
  }

  async updateException(id: string, updates: Partial<DiscrepancyException>): Promise<DiscrepancyException | null> {
    for (const [incId, list] of Array.from(this.exceptions.entries())) {
      const idx = list.findIndex((e: DiscrepancyException) => e.id === id);
      if (idx !== -1) {
        const updated = { ...list[idx], ...updates };
        list[idx] = updated;
        this.exceptions.set(incId, list);
        return JSON.parse(JSON.stringify(updated));
      }
    }
    return null;
  }

  async saveObservation(observation: ObservationRecord): Promise<ObservationRecord> {
    const cloned = JSON.parse(JSON.stringify(observation));
    const list = this.observations.get(observation.incidentId) || [];
    list.push(cloned);
    this.observations.set(observation.incidentId, list);
    return cloned;
  }

  async getObservations(incidentId: string): Promise<ObservationRecord[]> {
    const list = this.observations.get(incidentId) || [];
    return JSON.parse(JSON.stringify(list));
  }

  async saveEvidence(evidence: EvidenceRecord): Promise<EvidenceRecord> {
    const cloned = JSON.parse(JSON.stringify(evidence));
    const list = this.evidence.get(evidence.incidentId) || [];
    list.push(cloned);
    this.evidence.set(evidence.incidentId, list);
    return cloned;
  }

  async getEvidence(incidentId: string): Promise<EvidenceRecord[]> {
    const list = this.evidence.get(incidentId) || [];
    return JSON.parse(JSON.stringify(list));
  }

  async getEvidenceById(id: string): Promise<EvidenceRecord | null> {
    if (!id || !id.trim()) return null;
    for (const list of Array.from(this.evidence.values())) {
      const found = list.find((e) => e.id === id);
      if (found) return JSON.parse(JSON.stringify(found));
    }
    return null;
  }

  async saveAttestation(attestation: AttestationRecord): Promise<AttestationRecord> {
    const cloned = JSON.parse(JSON.stringify(attestation));
    const list = this.attestations.get(attestation.incidentId) || [];
    list.push(cloned);
    this.attestations.set(attestation.incidentId, list);
    return cloned;
  }

  async getAttestations(incidentId: string): Promise<AttestationRecord[]> {
    const list = this.attestations.get(incidentId) || [];
    return JSON.parse(JSON.stringify(list));
  }

  async appendAuditEvent(event: AuditEventRecord): Promise<AuditEventRecord> {
    const cloned = JSON.parse(JSON.stringify(event));
    const list = this.auditEvents.get(event.incidentId) || [];
    list.push(cloned);
    this.auditEvents.set(event.incidentId, list);
    return cloned;
  }

  async getAuditEvents(incidentId: string): Promise<AuditEventRecord[]> {
    const list = this.auditEvents.get(incidentId) || [];
    return JSON.parse(JSON.stringify(list));
  }

  async recordObservationAtomic(params: {
    observation: ObservationRecord;
    exception?: DiscrepancyException | null;
    actor: string;
    auditEvent: AuditEventRecord;
  }): Promise<{ observation: ObservationRecord; exception: DiscrepancyException | null; auditEvent: AuditEventRecord }> {
    // Deep clone snapshots for atomic rollback on simulated failure
    const obsSnapshot = new Map(
      Array.from(this.observations.entries()).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))])
    );
    const excSnapshot = new Map(
      Array.from(this.exceptions.entries()).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))])
    );
    const auditSnapshot = new Map(
      Array.from(this.auditEvents.entries()).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))])
    );

    try {
      await this.saveObservation(params.observation);

      if (params.exception) {
        const incidentExceptions = this.exceptions.get(params.observation.incidentId) || [];
        const existingIdx = incidentExceptions.findIndex((e) => e.type === "SHORTAGE" || e.type === "OVERAGE");
        if (existingIdx >= 0) {
          incidentExceptions[existingIdx] = {
            ...incidentExceptions[existingIdx],
            observedQty: params.exception.observedQty,
            delta: params.exception.delta,
            type: params.exception.type,
            agreementStatus: "PENDING_REVIEW",
          };
        } else {
          incidentExceptions.push(JSON.parse(JSON.stringify(params.exception)));
        }
        this.exceptions.set(params.observation.incidentId, incidentExceptions);
      }

      await this.appendAuditEvent(params.auditEvent);

      return {
        observation: params.observation,
        exception: params.exception || null,
        auditEvent: params.auditEvent,
      };
    } catch (err) {
      this.observations = obsSnapshot;
      this.exceptions = excSnapshot;
      this.auditEvents = auditSnapshot;
      throw err;
    }
  }

  async recordAttestationAtomic(params: {
    attestation: AttestationRecord;
    exceptionId: string;
    newAgreementStatus: AgreementStatus;
    auditEvent: AuditEventRecord;
  }): Promise<{ attestation: AttestationRecord; newAgreementStatus: AgreementStatus; auditEvent: AuditEventRecord }> {
    const attSnapshot = new Map(
      Array.from(this.attestations.entries()).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))])
    );
    const excSnapshot = new Map(
      Array.from(this.exceptions.entries()).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))])
    );
    const auditSnapshot = new Map(
      Array.from(this.auditEvents.entries()).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))])
    );

    try {
      await this.saveAttestation(params.attestation);

      const incidentExceptions = this.exceptions.get(params.attestation.incidentId) || [];
      const excIdx = incidentExceptions.findIndex((e) => e.id === params.exceptionId);
      if (excIdx >= 0) {
        incidentExceptions[excIdx] = {
          ...incidentExceptions[excIdx],
          agreementStatus: params.newAgreementStatus,
        };
      }
      this.exceptions.set(params.attestation.incidentId, incidentExceptions);

      await this.appendAuditEvent(params.auditEvent);

      return {
        attestation: params.attestation,
        newAgreementStatus: params.newAgreementStatus,
        auditEvent: params.auditEvent,
      };
    } catch (err) {
      this.attestations = attSnapshot;
      this.exceptions = excSnapshot;
      this.auditEvents = auditSnapshot;
      throw err;
    }
  }

  /**
   * Atomic damage observation persistence matching public.record_damage_observation_atomic.
   * Atomically records damage observation, creates/updates DAMAGE exception, and appends audit event.
   */
  async recordDamageObservationAtomic(params: {
    observationId: string;
    incidentId: string;
    damageDescription: string;
    sourceTurnId?: string | null;
    sourceQuote: string;
    speakerRole?: string;
    confidence?: number;
    confirmed?: boolean;
    exceptionId?: string;
    shipmentItemId?: string;
    cartonReference?: string | null;
    auditId?: string;
    actor?: string;
    eventType?: string;
    auditPayload?: Record<string, unknown>;
  }): Promise<{
    observation: ObservationRecord;
    exception: DiscrepancyException;
    auditEvent: AuditEventRecord;
  }> {
    // 1. Observation
    const obsRecord: ObservationRecord = {
      id: params.observationId,
      incidentId: params.incidentId,
      fieldKey: "damage_reported",
      valueJson: {
        damageDescription: params.damageDescription,
        cartonReference: params.cartonReference || null,
        condition: params.damageDescription,
      },
      sourceTurnId: params.sourceTurnId || null,
      sourceQuote: params.sourceQuote,
      speakerRole: (params.speakerRole as any) || "RECEIVER",
      confidence: params.confidence ?? 1.0,
      confirmed: params.confirmed ?? true,
      createdAt: new Date().toISOString(),
    };
    await this.saveObservation(obsRecord);

    // 2. Exception (DAMAGE isolated)
    const existingExceptions = await this.getExceptions(params.incidentId);
    const existingDmg = existingExceptions.find((e) => e.type === "DAMAGE");

    let excRecord: DiscrepancyException;
    if (existingDmg) {
      const updated = await this.updateException(existingDmg.id, {
        damageDescription: params.damageDescription,
        agreementStatus: existingDmg.agreementStatus || "PENDING_REVIEW",
      });
      excRecord = updated || existingDmg;
    } else {
      const inc = await this.getIncident(params.incidentId);
      let expectedQty = 48;
      let shipmentItemId = params.shipmentItemId;
      if (inc) {
        const shipment = await this.getShipment(inc.shipmentId);
        if (shipment?.items?.[0]) {
          expectedQty = shipment.items[0].expectedQty;
          if (!shipmentItemId) shipmentItemId = shipment.items[0].id;
        }
      }

      excRecord = await this.createException({
        id: params.exceptionId || `exc-dmg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        incidentId: params.incidentId,
        shipmentItemId: shipmentItemId || "item-default",
        type: "DAMAGE",
        expectedQty,
        observedQty: expectedQty,
        delta: 0,
        damageDescription: params.damageDescription,
        agreementStatus: "PENDING_REVIEW",
        createdAt: new Date().toISOString(),
      });
    }

    // 3. Audit Event
    const auditRecord: AuditEventRecord = {
      id: params.auditId || `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      incidentId: params.incidentId,
      actor: (params.actor as any) || "RECEIVER",
      eventType: params.eventType || "OBSERVATION_RECORDED",
      payloadJson: params.auditPayload || {
        fieldKey: "damage_reported",
        damageDescription: params.damageDescription,
        cartonReference: params.cartonReference || null,
      },
      createdAt: new Date().toISOString(),
    };
    await this.appendAuditEvent(auditRecord);

    return {
      observation: obsRecord,
      exception: excRecord,
      auditEvent: auditRecord,
    };
  }
}

export class SupabaseDataRepository implements DataRepository {
  private client: SupabaseClient | null = null;
  private fallback: MockStoreRepository;

  constructor(fallbackStore?: MockStoreRepository) {
    this.fallback = fallbackStore || new MockStoreRepository();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (this.isProductionFailClosed() && (!url || !key)) {
      throw new Error("Missing Supabase configuration in production environment. Refusing to start in insecure/silent mock mode.");
    }
    if (url && key && process.env.USE_MOCK_STORE !== "true") {
      try {
        this.client = createClient(url, key);
      } catch (e) {
        if (this.isProductionFailClosed()) {
          throw new Error(`Failed to initialize Supabase client in production: ${e instanceof Error ? e.message : String(e)}`);
        }
        console.warn("[SupabaseDataRepository] Failed to initialize Supabase client, using fallback:", e);
        this.client = null;
      }
    }
  }

  private isProductionFailClosed(): boolean {
    return process.env.NODE_ENV === "production" && process.env.USE_MOCK_STORE !== "true";
  }

  private isMockMode(): boolean {
    if (this.isProductionFailClosed()) {
      if (!this.client) {
        throw new Error("Supabase client is not initialized in production. Fail-closed enforced.");
      }
      return false;
    }
    return !this.client || process.env.USE_MOCK_STORE === "true";
  }

  private handleCatch<T>(operation: string, err: any, fallbackFn: () => T): T {
    if (this.isProductionFailClosed()) {
      throw (err instanceof Error ? err : new Error(`Database error on ${operation}: ${String(err)}`));
    }
    if (typeof err?.message === "string" && err.message.startsWith("Database error")) {
      throw err;
    }
    console.warn(`[SupabaseDataRepository] Network failure on ${operation}, falling back:`, err?.message);
    return fallbackFn();
  }

  async getShipments(): Promise<Shipment[]> {
    if (this.isMockMode()) return this.fallback.getShipments();
    try {
      const { data, error } = await this.client!
        .from("shipments")
        .select("id, po_number, bol_number, carrier_name, trailer_number, status, shipment_items(id, sku, description, expected_qty, unit)");
      if (error) {
        console.error("[SupabaseDataRepository] getShipments error:", error);
        throw new Error(`Database error on shipments: ${error.message}`);
      }
      if (!data || data.length === 0) return [];
      return data.map((row: any) => ({
        id: row.id,
        poNumber: row.po_number,
        bolNumber: row.bol_number,
        carrierName: row.carrier_name,
        trailerNumber: row.trailer_number,
        status: row.status,
        items: (row.shipment_items || []).map((item: any) => ({
          id: item.id,
          sku: item.sku,
          description: item.description,
          expectedQty: item.expected_qty,
          unit: item.unit || "cartons",
        })),
      }));
    } catch (err: any) {
      return this.handleCatch("getShipments", err, () => this.fallback.getShipments());
    }
  }

  async getShipment(idOrPo: string): Promise<Shipment | null> {
    if (!idOrPo || !idOrPo.trim()) return null;
    if (this.isMockMode()) return this.fallback.getShipment(idOrPo);

    const cleanKey = idOrPo.trim().toLowerCase().replace(/^shipment-/, "").replace(/^po-?/, "");
    try {
      const { data, error } = await this.client!
        .from("shipments")
        .select("id, po_number, bol_number, carrier_name, trailer_number, status, shipment_items(id, sku, description, expected_qty, unit)")
        .or(`po_number.eq.${cleanKey},po_number.eq.${idOrPo},id.eq.${idOrPo}`);

      if (error) {
        console.error("[SupabaseDataRepository] getShipment error:", error);
        throw new Error(`Database error on shipment: ${error.message}`);
      }
      if (!data || data.length === 0) return null;
      const row = data[0];
      return {
        id: row.id,
        poNumber: row.po_number,
        bolNumber: row.bol_number,
        carrierName: row.carrier_name,
        trailerNumber: row.trailer_number,
        status: row.status,
        items: (row.shipment_items || []).map((item: any) => ({
          id: item.id,
          sku: item.sku,
          description: item.description,
          expectedQty: item.expected_qty,
          unit: item.unit || "cartons",
        })),
      };
    } catch (err: any) {
      return this.handleCatch("getShipment", err, () => this.fallback.getShipment(idOrPo));
    }
  }

  async getIncidents(filters?: { shipmentId?: string; status?: string }): Promise<Incident[]> {
    if (this.isMockMode()) return this.fallback.getIncidents(filters);
    try {
      let query = this.client!.from("incidents").select("*").order("started_at", { ascending: false });
      if (filters?.shipmentId) query = query.eq("shipment_id", filters.shipmentId);
      if (filters?.status) query = query.eq("status", filters.status);
      const { data, error } = await query;
      if (error) {
        console.error("[SupabaseDataRepository] getIncidents error:", error);
        throw new Error(`Database error on incidents: ${error.message}`);
      }
      if (!data) return [];
      return data.map((row: any) => ({
        id: row.id,
        shipmentId: row.shipment_id,
        incidentNumber: row.incident_number,
        status: row.status,
        receiverName: row.receiver_name,
        driverName: row.driver_name,
        startedAt: row.started_at,
        completedAt: row.completed_at,
      }));
    } catch (err: any) {
      return this.handleCatch("getIncidents", err, () => this.fallback.getIncidents(filters));
    }
  }

  async getIncident(id: string): Promise<Incident | null> {
    if (this.isMockMode()) return this.fallback.getIncident(id);
    try {
      const { data, error } = await this.client!.from("incidents").select("*").eq("id", id).maybeSingle();
      if (error) {
        console.error("[SupabaseDataRepository] getIncident error:", error);
        throw new Error(`Database error on incident: ${error.message}`);
      }
      if (!data) return null;
      return {
        id: data.id,
        shipmentId: data.shipment_id,
        incidentNumber: data.incident_number,
        status: data.status,
        receiverName: data.receiver_name,
        driverName: data.driver_name,
        startedAt: data.started_at,
        completedAt: data.completed_at,
      };
    } catch (err: any) {
      return this.handleCatch("getIncident", err, () => this.fallback.getIncident(id));
    }
  }

  async createIncident(incident: Incident): Promise<Incident> {
    if (this.isMockMode()) return this.fallback.createIncident(incident);
    try {
      const { error } = await this.client!.from("incidents").insert({
        id: incident.id,
        shipment_id: incident.shipmentId,
        incident_number: incident.incidentNumber,
        status: incident.status,
        receiver_name: incident.receiverName || null,
        driver_name: incident.driverName || null,
        started_at: incident.startedAt,
        completed_at: incident.completedAt || null,
      });
      if (error) {
        console.error("[SupabaseDataRepository] createIncident error:", error);
        throw new Error(`Database error creating incident: ${error.message}`);
      }
      return incident;
    } catch (err: any) {
      return this.handleCatch("createIncident", err, () => this.fallback.createIncident(incident));
    }
  }

  async updateIncident(id: string, updates: Partial<Incident>): Promise<Incident | null> {
    if (this.isMockMode()) return this.fallback.updateIncident(id, updates);
    const pgUpdates: Record<string, any> = {};
    if (updates.status !== undefined) pgUpdates.status = updates.status;
    if (updates.receiverName !== undefined) pgUpdates.receiver_name = updates.receiverName;
    if (updates.driverName !== undefined) pgUpdates.driver_name = updates.driverName;
    if (updates.completedAt !== undefined) pgUpdates.completed_at = updates.completedAt;

    try {
      const { data, error } = await this.client!
        .from("incidents")
        .update(pgUpdates)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) {
        console.error("[SupabaseDataRepository] updateIncident error:", error);
        throw new Error(`Database error updating incident: ${error.message}`);
      }
      if (!data) return null;
      return {
        id: data.id,
        shipmentId: data.shipment_id,
        incidentNumber: data.incident_number,
        status: data.status,
        receiverName: data.receiver_name,
        driverName: data.driver_name,
        startedAt: data.started_at,
        completedAt: data.completed_at,
      };
    } catch (err: any) {
      return this.handleCatch("updateIncident", err, () => this.fallback.updateIncident(id, updates));
    }
  }

  async saveTurn(turn: TranscriptTurnRecord): Promise<TranscriptTurnRecord> {
    if (this.isMockMode()) return this.fallback.saveTurn(turn);
    try {
      const { error } = await this.client!.from("transcript_turns").insert({
        id: turn.id,
        incident_id: turn.incidentId,
        speaker_role: turn.speakerRole,
        text: turn.text,
        start_ms: turn.startMs ?? 0,
        end_ms: turn.endMs ?? 0,
        is_final: turn.isFinal ?? true,
        created_at: turn.createdAt,
      });
      if (error) {
        console.error("[SupabaseDataRepository] saveTurn error:", error);
        throw new Error(`Database error saving turn: ${error.message}`);
      }
      return turn;
    } catch (err: any) {
      return this.handleCatch("saveTurn", err, () => this.fallback.saveTurn(turn));
    }
  }

  async getTurns(incidentId: string): Promise<TranscriptTurnRecord[]> {
    if (this.isMockMode()) return this.fallback.getTurns(incidentId);
    try {
      const { data, error } = await this.client!
        .from("transcript_turns")
        .select("*")
        .eq("incident_id", incidentId)
        .order("created_at", { ascending: true });
      if (error) {
        console.error("[SupabaseDataRepository] getTurns error:", error);
        throw new Error(`Database error getting turns: ${error.message}`);
      }
      if (!data) return [];
      return data.map((r: any) => ({
        id: r.id,
        incidentId: r.incident_id,
        speakerRole: r.speaker_role,
        text: r.text,
        startMs: r.start_ms,
        endMs: r.end_ms,
        isFinal: r.is_final,
        confidence: r.confidence ?? 1.0,
        createdAt: r.created_at,
      }));
    } catch (err: any) {
      return this.handleCatch("getTurns", err, () => this.fallback.getTurns(incidentId));
    }
  }

  async createException(exception: DiscrepancyException): Promise<DiscrepancyException> {
    if (this.isMockMode()) return this.fallback.createException(exception);
    try {
      const { error } = await this.client!.from("exceptions").insert({
        id: exception.id,
        incident_id: exception.incidentId,
        shipment_item_id: exception.shipmentItemId,
        type: exception.type,
        expected_qty: exception.expectedQty,
        observed_qty: exception.observedQty,
        delta: exception.delta,
        damage_description: exception.damageDescription || null,
        agreement_status: exception.agreementStatus,
        created_at: exception.createdAt || new Date().toISOString(),
      });
      if (error) {
        console.error("[SupabaseDataRepository] createException error:", error);
        throw new Error(`Database error creating exception: ${error.message}`);
      }
      return exception;
    } catch (err: any) {
      return this.handleCatch("createException", err, () => this.fallback.createException(exception));
    }
  }

  async getExceptions(incidentId: string): Promise<DiscrepancyException[]> {
    if (this.isMockMode()) return this.fallback.getExceptions(incidentId);
    try {
      const { data, error } = await this.client!
        .from("exceptions")
        .select("*")
        .eq("incident_id", incidentId);
      if (error) {
        console.error("[SupabaseDataRepository] getExceptions error:", error);
        throw new Error(`Database error getting exceptions: ${error.message}`);
      }
      if (!data) return [];
      return data.map((r: any) => ({
        id: r.id,
        incidentId: r.incident_id,
        shipmentItemId: r.shipment_item_id,
        type: r.type,
        expectedQty: r.expected_qty,
        observedQty: r.observed_qty,
        delta: r.delta,
        damageDescription: r.damage_description,
        agreementStatus: r.agreement_status,
        createdAt: r.created_at,
      }));
    } catch (err: any) {
      return this.handleCatch("getExceptions", err, () => this.fallback.getExceptions(incidentId));
    }
  }

  async updateException(id: string, updates: Partial<DiscrepancyException>): Promise<DiscrepancyException | null> {
    if (this.isMockMode()) return this.fallback.updateException(id, updates);
    const pgUpdates: Record<string, any> = {};
    if (updates.agreementStatus !== undefined) pgUpdates.agreement_status = updates.agreementStatus;
    if (updates.observedQty !== undefined) pgUpdates.observed_qty = updates.observedQty;
    if (updates.delta !== undefined) pgUpdates.delta = updates.delta;
    if (updates.damageDescription !== undefined) pgUpdates.damage_description = updates.damageDescription;

    try {
      const { data, error } = await this.client!
        .from("exceptions")
        .update(pgUpdates)
        .eq("id", id)
        .select()
        .maybeSingle();
      if (error) {
        console.error("[SupabaseDataRepository] updateException error:", error);
        throw new Error(`Database error updating exception: ${error.message}`);
      }
      if (!data) return null;
      return {
        id: data.id,
        incidentId: data.incident_id,
        shipmentItemId: data.shipment_item_id,
        type: data.type,
        expectedQty: data.expected_qty,
        observedQty: data.observed_qty,
        delta: data.delta,
        damageDescription: data.damage_description,
        agreementStatus: data.agreement_status,
        createdAt: data.created_at,
      };
    } catch (err: any) {
      return this.handleCatch("updateException", err, () => this.fallback.updateException(id, updates));
    }
  }

  async saveObservation(observation: ObservationRecord): Promise<ObservationRecord> {
    if (this.isMockMode()) return this.fallback.saveObservation(observation);
    try {
      let resolvedTurnId = observation.sourceTurnId || null;
      if (resolvedTurnId) {
        const { data: turnData } = await this.client!
          .from("transcript_turns")
          .select("id")
          .eq("id", resolvedTurnId)
          .maybeSingle();
        if (!turnData) {
          resolvedTurnId = null;
        }
      }

      const { error } = await this.client!.from("observations").insert({
        id: observation.id,
        incident_id: observation.incidentId,
        field_key: observation.fieldKey,
        value_json: observation.valueJson,
        source_turn_id: resolvedTurnId,
        source_quote: observation.sourceQuote,
        speaker_role: observation.speakerRole,
        confidence: observation.confidence,
        confirmed: observation.confirmed ?? false,
        created_at: observation.createdAt || new Date().toISOString(),
      });
      if (error) {
        console.error("[SupabaseDataRepository] saveObservation error:", error);
        throw new Error(`Database error saving observation: ${error.message}`);
      }
      return observation;
    } catch (err: any) {
      return this.handleCatch("saveObservation", err, () => this.fallback.saveObservation(observation));
    }
  }

  async getObservations(incidentId: string): Promise<ObservationRecord[]> {
    if (this.isMockMode()) return this.fallback.getObservations(incidentId);
    try {
      const { data, error } = await this.client!
        .from("observations")
        .select("*")
        .eq("incident_id", incidentId);
      if (error) {
        console.error("[SupabaseDataRepository] getObservations error:", error);
        throw new Error(`Database error getting observations: ${error.message}`);
      }
      if (!data) return [];
      return data.map((r: any) => ({
        id: r.id,
        incidentId: r.incident_id,
        fieldKey: r.field_key,
        valueJson: r.value_json,
        sourceTurnId: r.source_turn_id,
        sourceQuote: r.source_quote,
        speakerRole: r.speaker_role,
        confidence: r.confidence,
        confirmed: r.confirmed,
        createdAt: r.created_at,
      }));
    } catch (err: any) {
      return this.handleCatch("getObservations", err, () => this.fallback.getObservations(incidentId));
    }
  }

  async saveEvidence(evidence: EvidenceRecord): Promise<EvidenceRecord> {
    if (this.isMockMode()) return this.fallback.saveEvidence(evidence);
    try {
      const { error } = await this.client!.from("evidence").insert({
        id: evidence.id,
        incident_id: evidence.incidentId,
        type: evidence.type,
        storage_path: evidence.storagePath,
        description: evidence.description || null,
        captured_by: evidence.capturedBy,
        created_at: evidence.createdAt || new Date().toISOString(),
      });
      if (error) {
        console.error("[SupabaseDataRepository] saveEvidence error:", error);
        throw new Error(`Database error saving evidence: ${error.message}`);
      }
      return evidence;
    } catch (err: any) {
      return this.handleCatch("saveEvidence", err, () => this.fallback.saveEvidence(evidence));
    }
  }

  async getEvidence(incidentId: string): Promise<EvidenceRecord[]> {
    if (this.isMockMode()) return this.fallback.getEvidence(incidentId);
    try {
      const { data, error } = await this.client!.from("evidence").select("*").eq("incident_id", incidentId);
      if (error) {
        console.error("[SupabaseDataRepository] getEvidence error:", error);
        throw new Error(`Database error getting evidence: ${error.message}`);
      }
      if (!data) return [];
      return data.map((r: any) => ({
        id: r.id,
        incidentId: r.incident_id,
        type: r.type,
        storagePath: r.storage_path,
        description: r.description,
        capturedBy: r.captured_by,
        createdAt: r.created_at,
      }));
    } catch (err: any) {
      return this.handleCatch("getEvidence", err, () => this.fallback.getEvidence(incidentId));
    }
  }

  async getEvidenceById(id: string): Promise<EvidenceRecord | null> {
    if (!id || !id.trim()) return null;
    if (this.isMockMode()) return this.fallback.getEvidenceById(id);
    try {
      const { data, error } = await this.client!.from("evidence").select("*").eq("id", id).maybeSingle();
      if (error) {
        console.error("[SupabaseDataRepository] getEvidenceById error:", error);
        throw new Error(`Database error getting evidence: ${error.message}`);
      }
      if (!data) return null;
      return {
        id: data.id,
        incidentId: data.incident_id,
        type: data.type,
        storagePath: data.storage_path,
        description: data.description,
        capturedBy: data.captured_by,
        createdAt: data.created_at,
      };
    } catch (err: any) {
      if (err?.message?.startsWith("Database error on") || err?.message?.startsWith("Database error getting")) throw err;
      console.warn("[SupabaseDataRepository] Network failure on getEvidenceById, falling back:", err?.message);
      return this.fallback.getEvidenceById(id);
    }
  }

  async saveAttestation(attestation: AttestationRecord): Promise<AttestationRecord> {
    if (this.isMockMode()) return this.fallback.saveAttestation(attestation);
    try {
      let resolvedTurnId = attestation.sourceTurnId || null;
      if (resolvedTurnId) {
        const { data: turnData } = await this.client!
          .from("transcript_turns")
          .select("id")
          .eq("id", resolvedTurnId)
          .maybeSingle();
        if (!turnData) {
          resolvedTurnId = null;
        }
      }

      const { error } = await this.client!.from("attestations").insert({
        id: attestation.id,
        incident_id: attestation.incidentId,
        exception_id: attestation.exceptionId,
        party_role: attestation.partyRole,
        position: attestation.position,
        source_turn_id: resolvedTurnId,
        created_at: attestation.createdAt || new Date().toISOString(),
      });
      if (error) {
        console.error("[SupabaseDataRepository] saveAttestation error:", error);
        throw new Error(`Database error saving attestation: ${error.message}`);
      }
      return attestation;
    } catch (err: any) {
      return this.handleCatch("saveAttestation", err, () => this.fallback.saveAttestation(attestation));
    }
  }

  async getAttestations(incidentId: string): Promise<AttestationRecord[]> {
    if (this.isMockMode()) return this.fallback.getAttestations(incidentId);
    try {
      const { data, error } = await this.client!.from("attestations").select("*").eq("incident_id", incidentId);
      if (error) {
        console.error("[SupabaseDataRepository] getAttestations error:", error);
        throw new Error(`Database error getting attestations: ${error.message}`);
      }
      if (!data) return [];
      return data.map((r: any) => ({
        id: r.id,
        incidentId: r.incident_id,
        exceptionId: r.exception_id,
        partyRole: r.party_role,
        position: r.position,
        sourceTurnId: r.source_turn_id,
        createdAt: r.created_at,
      }));
    } catch (err: any) {
      return this.handleCatch("getAttestations", err, () => this.fallback.getAttestations(incidentId));
    }
  }

  async appendAuditEvent(event: AuditEventRecord): Promise<AuditEventRecord> {
    if (this.isMockMode()) return this.fallback.appendAuditEvent(event);
    try {
      const { error } = await this.client!.from("audit_events").insert({
        id: event.id,
        incident_id: event.incidentId,
        actor: event.actor,
        event_type: event.eventType,
        payload_json: event.payloadJson,
        created_at: event.createdAt || new Date().toISOString(),
      });
      if (error) {
        console.error("[SupabaseDataRepository] appendAuditEvent error:", error);
        throw new Error(`Database error appending audit event: ${error.message}`);
      }
      return event;
    } catch (err: any) {
      return this.handleCatch("appendAuditEvent", err, () => this.fallback.appendAuditEvent(event));
    }
  }

  async getAuditEvents(incidentId: string): Promise<AuditEventRecord[]> {
    if (this.isMockMode()) return this.fallback.getAuditEvents(incidentId);
    try {
      const { data, error } = await this.client!
        .from("audit_events")
        .select("*")
        .eq("incident_id", incidentId)
        .order("created_at", { ascending: true });
      if (error) {
        console.error("[SupabaseDataRepository] getAuditEvents error:", error);
        throw new Error(`Database error getting audit events: ${error.message}`);
      }
      if (!data) return [];
      return data.map((r: any) => ({
        id: r.id,
        incidentId: r.incident_id,
        actor: r.actor,
        eventType: r.event_type,
        payloadJson: r.payload_json,
        createdAt: r.created_at,
      }));
    } catch (err: any) {
      return this.handleCatch("getAuditEvents", err, () => this.fallback.getAuditEvents(incidentId));
    }
  }

  async recordObservationAtomic(params: {
    observation: ObservationRecord;
    exception?: DiscrepancyException | null;
    actor: string;
    auditEvent: AuditEventRecord;
  }): Promise<{ observation: ObservationRecord; exception: DiscrepancyException | null; auditEvent: AuditEventRecord }> {
    if (this.isMockMode()) return this.fallback.recordObservationAtomic(params);
    try {
      let resolvedTurnId = params.observation.sourceTurnId || null;
      if (resolvedTurnId) {
        const { data: turnData } = await this.client!
          .from("transcript_turns")
          .select("id")
          .eq("id", resolvedTurnId)
          .maybeSingle();
        if (!turnData) {
          resolvedTurnId = null;
        }
      }

      const { error } = await this.client!.rpc("record_observation_atomic", {
        p_obs_id: params.observation.id,
        p_incident_id: params.observation.incidentId,
        p_field_key: params.observation.fieldKey,
        p_value_json: params.observation.valueJson,
        p_source_turn_id: resolvedTurnId,
        p_source_quote: params.observation.sourceQuote || "",
        p_speaker_role: params.observation.speakerRole,
        p_confidence: params.observation.confidence,
        p_confirmed: params.observation.confirmed,
        p_exc_id: params.exception?.id || null,
        p_shipment_item_id: params.exception?.shipmentItemId || null,
        p_exc_type: params.exception?.type || null,
        p_expected_qty: params.exception?.expectedQty ?? null,
        p_observed_qty: params.exception?.observedQty ?? null,
        p_delta: params.exception?.delta ?? null,
        p_audit_id: params.auditEvent.id,
        p_actor: params.actor,
        p_event_type: params.auditEvent.eventType || "OBSERVATION_RECORDED",
        p_audit_payload: params.auditEvent.payloadJson,
      });

      if (error) {
        console.error("[SupabaseDataRepository] recordObservationAtomic error:", error);
        throw new Error(`Database error on recordObservationAtomic: ${error.message || JSON.stringify(error)}`);
      }

      return {
        observation: params.observation,
        exception: params.exception || null,
        auditEvent: params.auditEvent,
      };
    } catch (err: any) {
      return this.handleCatch("recordObservationAtomic", err, () => this.fallback.recordObservationAtomic(params));
    }
  }

  async recordAttestationAtomic(params: {
    attestation: AttestationRecord;
    exceptionId: string;
    newAgreementStatus: AgreementStatus;
    auditEvent: AuditEventRecord;
  }): Promise<{ attestation: AttestationRecord; newAgreementStatus: AgreementStatus; auditEvent: AuditEventRecord }> {
    if (this.isMockMode()) return this.fallback.recordAttestationAtomic(params);
    try {
      const { error } = await this.client!.rpc("record_attestation_atomic", {
        p_att_id: params.attestation.id,
        p_incident_id: params.attestation.incidentId,
        p_exception_id: params.exceptionId,
        p_party_role: params.attestation.partyRole,
        p_position: params.attestation.position,
        p_source_turn_id: params.attestation.sourceTurnId || null,
        p_new_agreement_status: params.newAgreementStatus,
        p_audit_id: params.auditEvent.id,
        p_audit_payload: params.auditEvent.payloadJson,
      });

      if (error) {
        console.error("[SupabaseDataRepository] recordAttestationAtomic error:", error);
        throw new Error(`Database error on recordAttestationAtomic: ${error.message || JSON.stringify(error)}`);
      }

      return {
        attestation: params.attestation,
        newAgreementStatus: params.newAgreementStatus,
        auditEvent: params.auditEvent,
      };
    } catch (err: any) {
      return this.handleCatch("recordAttestationAtomic", err, () => this.fallback.recordAttestationAtomic(params));
    }
  }

  /**
   * Atomic damage observation persistence via record_damage_observation_atomic RPC.
   */
  async recordDamageObservationAtomic(params: {
    observationId: string;
    incidentId: string;
    damageDescription: string;
    sourceTurnId?: string | null;
    sourceQuote: string;
    speakerRole?: string;
    confidence?: number;
    confirmed?: boolean;
    exceptionId?: string;
    shipmentItemId?: string;
    cartonReference?: string | null;
    auditId?: string;
    actor?: string;
    eventType?: string;
    auditPayload?: Record<string, unknown>;
  }): Promise<{
    observation: ObservationRecord;
    exception: DiscrepancyException;
    auditEvent: AuditEventRecord;
  }> {
    if (this.isMockMode()) {
      return this.fallback.recordDamageObservationAtomic(params);
    }

    try {
      const { error } = await this.client!.rpc("record_damage_observation_atomic", {
        p_obs_id: params.observationId,
        p_incident_id: params.incidentId,
        p_damage_desc: params.damageDescription,
        p_source_turn_id: params.sourceTurnId || null,
        p_source_quote: params.sourceQuote,
        p_speaker_role: params.speakerRole || "RECEIVER",
        p_confidence: params.confidence ?? 1.0,
        p_confirmed: params.confirmed ?? true,
        p_exc_id: params.exceptionId || `exc-dmg-${Date.now()}`,
        p_shipment_item_id: params.shipmentItemId || null,
        p_carton_reference: params.cartonReference || null,
        p_audit_id: params.auditId || `audit-${Date.now()}`,
        p_actor: params.actor || "RECEIVER",
        p_event_type: params.eventType || "OBSERVATION_RECORDED",
        p_audit_payload: params.auditPayload || {
          fieldKey: "damage_reported",
          damageDescription: params.damageDescription,
          cartonReference: params.cartonReference || null,
        },
      });

      if (error) {
        console.error("[SupabaseDataRepository] record_damage_observation_atomic RPC error:", error);
        throw new Error(`Database error executing damage RPC: ${error.message}`);
      }

      // Also mirror to fallback for local memory consistency
      return await this.fallback.recordDamageObservationAtomic(params);
    } catch (err: any) {
      if (err?.message?.startsWith("Database error executing damage RPC")) throw err;
      console.warn("[SupabaseDataRepository] Network failure on recordDamageObservationAtomic, using fallback:", err?.message);
      return this.fallback.recordDamageObservationAtomic(params);
    }
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __dockwitness_repository__: DataRepository | undefined;
}

export function createDataRepository(): DataRepository {
  if (!globalThis.__dockwitness_repository__) {
    globalThis.__dockwitness_repository__ = new SupabaseDataRepository();
  }
  return globalThis.__dockwitness_repository__;
}

export const repository: DataRepository = createDataRepository();



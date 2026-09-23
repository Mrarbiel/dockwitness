/**
 * AssemblyAI Voice Agent Tool Definitions & Dispatcher for DockWitness
 * Enforces: AI understands speech; code determines facts. Humans determine responsibility.
 * Disagreement is recorded, never manufactured. Liability is permanently NOT_DETERMINED.
 */

import { VoiceAgentToolDefinition } from "./voice-agent-types";
import { repository } from "@/lib/repository";
import { calculateDiscrepancy } from "@/lib/domain/quantity-engine";
import { damageExtractor } from "@/lib/domain/damage-extractor";
import { evaluateAgreement, resolveReceiverPosition } from "@/lib/domain/agreement-engine";

export const DOCKWITNESS_VOICE_AGENT_SYSTEM_PROMPT = `
You are DockWitness Voice Agent, an autonomous dock receiving voice co-pilot assisting warehouse receivers and freight drivers during delivery inspection.

NON-NEGOTIABLE CORE INVARIANTS:
1. AI understands speech; code determines facts. Humans determine responsibility.
2. DockWitness records disagreement; it NEVER manufactures agreement.
3. Silence is NEVER consent. Silence, absence, refusal, uncertainty, and disagreement are different facts. Never map refusal or uncertainty to dispute.
   - Explicit confirmation -> CONFIRM
   - Active disagreement -> DISPUTE
   - Driver uncertainty/unaware -> NO_KNOWLEDGE
   - Driver refuses to sign/attest -> REFUSED_TO_ATTEST (record verbatim refusal and proceed to review; never block the warehouse)
   - Discovered post-departure / driver gone -> DRIVER_UNAVAILABLE
4. Liability is permanently NOT_DETERMINED. You must NEVER infer, suggest, or record fault, negligence, or legal claim validity.
5. NEVER calculate carton shortage or overage arithmetic yourself. When the receiver states a count or damage, invoke 'record_candidate_observation'. The backend deterministic engine computes quantity deltas.
6. When carton damage is reported, required photo evidence MUST be captured before readiness review.
7. Step 1 is Receiver Inspection (carton count & damage). Step 2 is Driver Attestation. If receipt is clean (expected count, zero damage), no driver dispute is needed.
8. Be concise, professional, industrial, and clear in spoken dock dialogue.
`.trim();

export const DOCKWITNESS_VOICE_AGENT_TOOLS: VoiceAgentToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_shipment",
      description: "Fetches expected shipment manifest details (PO number, BOL, carrier, expected carton count, SKU, trailer number).",
      parameters: {
        type: "object",
        properties: {
          shipmentId: {
            type: "string",
            description: "The shipment ID (e.g. shipment-po44891).",
          },
        },
        required: ["shipmentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_workflow_state",
      description: "Inspects current incident workflow state, observed cartons, delta, exceptions, photos, driver attestations, and readiness checklist.",
      parameters: {
        type: "object",
        properties: {
          incidentId: {
            type: "string",
            description: "The current incident ID.",
          },
        },
        required: ["incidentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_candidate_observation",
      description: "Submits receiver candidate count or damage observation from spoken statement. Feeds the deterministic rules engine.",
      parameters: {
        type: "object",
        properties: {
          incidentId: {
            type: "string",
            description: "The incident ID.",
          },
          fieldKey: {
            type: "string",
            description: "Field key: 'observed_qty' or 'damage_reported'.",
            enum: ["observed_qty", "damage_reported"],
          },
          value: {
            type: "number",
            description: "The observed count value (if fieldKey is observed_qty).",
          },
          quote: {
            type: "string",
            description: "The exact spoken transcript quote for forensic evidence provenance.",
          },
        },
        required: ["incidentId", "fieldKey", "quote"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "record_driver_attestation",
      description: "Records the freight driver's explicit position on a specific exception (shortage, overage, or damage).",
      parameters: {
        type: "object",
        properties: {
          incidentId: {
            type: "string",
            description: "The incident ID.",
          },
          exceptionId: {
            type: "string",
            description: "The real exception ID belonging to this incident.",
          },
          position: {
            type: "string",
            description: "Driver's position: CONFIRM, DISPUTE, NO_KNOWLEDGE, REFUSED_TO_ATTEST, or DRIVER_UNAVAILABLE. Never guess.",
            enum: ["CONFIRM", "DISPUTE", "NO_KNOWLEDGE", "REFUSED_TO_ATTEST", "DRIVER_UNAVAILABLE"],
          },
          statement: {
            type: "string",
            description: "The driver's verbatim spoken quote.",
          },
        },
        required: ["incidentId", "exceptionId", "position"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_missing_evidence",
      description: "Checks if mandatory evidence (e.g. damage photos or driver attestation) is missing and returns exact guidance.",
      parameters: {
        type: "object",
        properties: {
          incidentId: {
            type: "string",
            description: "The incident ID.",
          },
          reason: {
            type: "string",
            description: "Context or category of missing evidence.",
          },
        },
        required: ["incidentId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "evaluate_readiness",
      description: "Runs deterministic readiness evaluation to see if the incident is unblocked and ready for operations review.",
      parameters: {
        type: "object",
        properties: {
          incidentId: {
            type: "string",
            description: "The incident ID.",
          },
        },
        required: ["incidentId"],
      },
    },
  },
];

/**
 * Client-side tool dispatcher executing actions against DockWitness API routes
 */
export async function executeVoiceAgentTool(
  toolName: string,
  args: Record<string, unknown>,
  baseUrl = ""
): Promise<Record<string, unknown>> {
  const isDirectRepositoryMode = typeof window === "undefined" && !baseUrl;
  const resolvedBaseUrl = baseUrl || (typeof window !== "undefined" ? "" : (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  switch (toolName) {
    case "get_shipment": {
      const shipmentId = String(args.shipmentId || "");
      if (isDirectRepositoryMode) {
        const data = await repository.getShipment(shipmentId);
        if (!data) return { error: `Shipment ${shipmentId} not found` };
        return {
          shipmentId: data.id,
          poNumber: data.poNumber,
          bolNumber: data.bolNumber,
          carrierName: data.carrierName,
          trailerNumber: data.trailerNumber,
          expectedQuantity: data.items?.[0]?.expectedQty || 0,
          sku: data.items?.[0]?.sku || "",
          unit: data.items?.[0]?.unit || "cartons",
        };
      }
      const res = await fetch(`${resolvedBaseUrl}/api/shipments/${shipmentId}`);
      if (!res.ok) return { error: `Shipment ${shipmentId} not found` };
      const data = await res.json();
      return {
        shipmentId: data.id,
        poNumber: data.poNumber,
        bolNumber: data.bolNumber,
        carrierName: data.carrierName,
        trailerNumber: data.trailerNumber,
        expectedQuantity: data.items?.[0]?.expectedQty || 0,
        sku: data.items?.[0]?.sku || "",
        unit: data.items?.[0]?.unit || "cartons",
      };
    }

    case "get_workflow_state": {
      const incidentId = String(args.incidentId || "");
      if (isDirectRepositoryMode) {
        const inc = await repository.getIncident(incidentId);
        if (!inc) return { error: `Incident ${incidentId} not found` };
        const exceptions = await repository.getExceptions(incidentId);
        const evidence = await repository.getEvidence(incidentId);
        const attestations = await repository.getAttestations(incidentId);
        const observations = await repository.getObservations(incidentId);
        return {
          incidentId: inc.id,
          status: inc.status,
          observationsCount: observations.length,
          exceptions: exceptions.map((e) => ({
            id: e.id,
            type: e.type,
            delta: e.delta,
            damageDescription: e.damageDescription,
            agreementStatus: e.agreementStatus,
          })),
          photosCount: evidence.filter((ev) => ev.type === "PHOTO").length,
          attestations: attestations.map((a) => ({
            partyRole: a.partyRole,
            position: a.position,
            exceptionId: a.exceptionId,
          })),
        };
      }
      const res = await fetch(`${resolvedBaseUrl}/api/incidents/${incidentId}`);
      if (!res.ok) return { error: `Incident ${incidentId} not found` };
      const inc = await res.json();
      return {
        incidentId: inc.id,
        status: inc.status,
        observationsCount: inc.observations?.length || 0,
        exceptions: inc.exceptions?.map((e: { id: string; type: string; delta: number; damageDescription?: string; agreementStatus: string }) => ({
          id: e.id,
          type: e.type,
          delta: e.delta,
          damageDescription: e.damageDescription,
          agreementStatus: e.agreementStatus,
        })) || [],
        photosCount: inc.evidence?.filter((ev: { type: string }) => ev.type === "PHOTO").length || 0,
        attestations: inc.attestations?.map((a: { partyRole: string; position: string; exceptionId: string }) => ({
          partyRole: a.partyRole,
          position: a.position,
          exceptionId: a.exceptionId,
        })) || [],
      };
    }

    case "record_candidate_observation": {
      const incidentId = String(args.incidentId || "");
      const fieldKey = String(args.fieldKey || "");
      const quote = String(args.quote || "");
      const value = args.value !== undefined ? Number(args.value) : undefined;

      if (isDirectRepositoryMode) {
        const inc = await repository.getIncident(incidentId);
        if (inc) {
          const shipment = await repository.getShipment(inc.shipmentId);
          const expectedQty = shipment?.items?.[0]?.expectedQty || 48;
          const shipmentItemId = shipment?.items?.[0]?.id || "item-default";

          let countObsRecord: any = null;
          let qtyExcRecord: any = null;

          if (value !== undefined) {
            const discrepancy = calculateDiscrepancy(expectedQty, value);
            let excParam = null;
            if (discrepancy.type) {
              excParam = {
                id: `exc-qty-${Date.now()}`,
                incidentId,
                shipmentItemId,
                type: discrepancy.type,
                expectedQty,
                observedQty: value,
                delta: discrepancy.delta,
                agreementStatus: "PENDING_REVIEW" as const,
                createdAt: new Date().toISOString(),
              };
            }
            const atomicRes = await repository.recordObservationAtomic({
              observation: {
                id: `obs-qty-${Date.now()}`,
                incidentId,
                fieldKey: "observed_qty",
                valueJson: { observedQty: value },
                sourceQuote: quote || `Count: ${value}`,
                speakerRole: "RECEIVER",
                confidence: 1.0,
                confirmed: true,
                createdAt: new Date().toISOString(),
              },
              exception: excParam,
              actor: "RECEIVER",
              auditEvent: {
                id: `audit-count-${Date.now()}`,
                incidentId,
                actor: "RECEIVER",
                eventType: "OBSERVATION_RECORDED",
                payloadJson: { fieldKey: "observed_qty", observedQty: value, expectedQty },
                createdAt: new Date().toISOString(),
              },
            });
            countObsRecord = atomicRes.observation;
            qtyExcRecord = atomicRes.exception;
          }

          const damageInfo = quote ? damageExtractor.extractDamage(quote) : null;
          let dmgExcRecord: any = null;
          if (damageInfo || fieldKey === "damage_reported") {
            const cond = damageInfo?.condition || "damaged";
            const dmgRes = await repository.recordDamageObservationAtomic({
              observationId: `obs-dmg-${Date.now()}`,
              incidentId,
              damageDescription: cond,
              cartonReference: damageInfo?.cartonReference || null,
              sourceQuote: quote || `Damage: ${cond}`,
              speakerRole: "RECEIVER",
              confidence: 1.0,
              confirmed: true,
              exceptionId: `exc-dmg-${Date.now()}`,
              shipmentItemId,
              actor: "RECEIVER",
              eventType: "OBSERVATION_RECORDED",
            });
            dmgExcRecord = dmgRes.exception;
          }

          const exceptions = await repository.getExceptions(incidentId);
          return {
            recorded: true,
            observedQuantity: value,
            discrepancy: value !== undefined ? calculateDiscrepancy(expectedQty, value) : null,
            exception: qtyExcRecord || dmgExcRecord,
            damageException: dmgExcRecord,
            exceptions,
          };
        }
      }

      // Pass both quantity and quote context to observation endpoint
      try {
        const obsRes = await fetch(`${resolvedBaseUrl}/api/incidents/${incidentId}/observation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            observedQty: value,
            reason: "Receiver voice statement via Voice Agent",
            actor: "RECEIVER",
            sourceQuote: quote,
            fieldKey: fieldKey || (value !== undefined ? "observed_qty" : "damage_reported"),
          }),
        });

        if (obsRes.ok) {
          const data = await obsRes.json();
          return {
            recorded: true,
            observedQuantity: value,
            discrepancy: data.discrepancy,
            exception: data.exception,
            damageException: data.damageException,
            exceptions: data.exceptions || (data.exception ? [data.exception, ...(data.damageException ? [data.damageException] : [])] : []),
          };
        }
      } catch {
        // Fallback for non-count extraction
      }

      // Fallback for non-count extraction if observation route returned non-2xx
      try {
        const extRes = await fetch(`${resolvedBaseUrl}/api/incidents/${incidentId}/extract`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: quote,
            speakerRole: "RECEIVER",
          }),
        });
        if (!extRes.ok) return { error: "Failed to process observation" };
        const data = await extRes.json();
        return {
          recorded: true,
          extractedCandidates: data.candidates,
          exceptions: data.exceptions,
        };
      } catch {
        return { error: "Failed to process observation" };
      }
    }

    case "record_driver_attestation": {
      const incidentId = String(args.incidentId || "");
      const exceptionId = String(args.exceptionId || "");
      const position = String(args.position || "");
      const statement = String(args.statement || "");

      if (isDirectRepositoryMode) {
        const exceptions = await repository.getExceptions(incidentId);
        const targetException = exceptions.find((e) => e.id === exceptionId);
        if (targetException) {
          const allObservations = await repository.getObservations(incidentId);
          const allAttestations = await repository.getAttestations(incidentId);
          const receiverPos = resolveReceiverPosition(targetException, allAttestations, allObservations);
          const newStatus = evaluateAgreement(receiverPos, position as any);
          const attRes = await repository.recordAttestationAtomic({
            attestation: {
              id: `att-${Date.now()}`,
              incidentId,
              exceptionId,
              partyRole: "DRIVER",
              position: position as any,
              createdAt: new Date().toISOString(),
            },
            exceptionId,
            newAgreementStatus: newStatus,
            auditEvent: {
              id: `audit-${Date.now()}`,
              incidentId,
              actor: "DRIVER",
              eventType: "ATTESTATION_RECORDED",
              payloadJson: { exceptionId, position, resultingStatus: newStatus },
              createdAt: new Date().toISOString(),
            },
          });
          return {
            recorded: true,
            attestationId: attRes.attestation.id,
            agreementStatus: attRes.newAgreementStatus,
          };
        }
      }

      const attRes = await fetch(`${resolvedBaseUrl}/api/incidents/${incidentId}/attestation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exceptionId,
          partyRole: "DRIVER",
          position,
          sourceTurnId: statement ? `drv-quote-${Date.now()}` : undefined,
        }),
      });
      if (!attRes.ok) {
        const err = await attRes.json().catch(() => ({ error: "Failed to record attestation" }));
        return { error: err.error || "Failed to record attestation" };
      }
      const data = await attRes.json();
      return {
        recorded: true,
        attestationId: data.id,
        agreementStatus: data.agreementStatus || data.resultingStatus,
      };
    }

    case "request_missing_evidence": {
      const incidentId = String(args.incidentId || "");
      const evalRes = await fetch(`${resolvedBaseUrl}/api/incidents/${incidentId}/evaluate`, { method: "POST" });
      if (!evalRes.ok) return { error: "Failed to inspect readiness" };
      const data = await evalRes.json();
      const reasons = data.readiness?.blockingReasons || [];
      return {
        isReadyForReview: data.readiness?.readyForReview || false,
        readinessStatus: data.readiness?.status || "AWAITING_INSPECTION",
        blockingReasons: reasons,
        guidance: reasons.length === 0
          ? "All required evidence is complete. Ready for operations review."
          : `Evidence required before truck departure: ${reasons.join("; ")}`,
      };
    }

    case "evaluate_readiness": {
      const incidentId = String(args.incidentId || "");
      const evalRes = await fetch(`${resolvedBaseUrl}/api/incidents/${incidentId}/evaluate`, { method: "POST" });
      if (!evalRes.ok) return { error: "Failed to evaluate readiness" };
      const data = await evalRes.json();
      return {
        evaluated: true,
        readiness: data.readiness,
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

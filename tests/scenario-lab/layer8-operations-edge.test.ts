import { describe, it, expect } from "vitest";
import { evaluateAgreement } from "@/lib/domain/agreement-engine";
import { evaluateReadiness } from "@/lib/domain/readiness-engine";
import { transitionState } from "@/lib/domain/state-machine";
import { extractDriverAttestations } from "@/lib/extraction/driver-attestation-extractor";
import { extractCandidateQuantity, extractCandidateDamage } from "@/lib/extraction/quantity-extractor";

describe("Layer 8: Operational Edge Cases & Freight Invariant Robustness", () => {
  describe("Edge Case 1: Driver Refusal ('I'm not signing anything')", () => {
    it("extracts REFUSED_TO_ATTEST position from hostile driver spoken statement", () => {
      const hostileStatements = [
        "I'm not signing anything. Talk to dispatch.",
        "I refuse to attest to this shortage.",
        "Hell no, I ain't signing your tablet.",
        "I decline to sign off on damaged goods.",
      ];

      for (const statement of hostileStatements) {
        const extracted = extractDriverAttestations(statement);
        expect(extracted.quantityPosition).toBe("REFUSED_TO_ATTEST");
        expect(extracted.damagePosition).toBe("REFUSED_TO_ATTEST");
        expect(extracted.rawText).toBe(statement);
      }
    });

    it("evaluates DRIVER_REFUSED agreement status without conflating it with DISPUTE or AGREED", () => {
      // Receiver confirmed shortage, driver explicitly refused to sign
      const agreementStatus = evaluateAgreement("CONFIRM", "REFUSED_TO_ATTEST");
      expect(agreementStatus).toBe("DRIVER_REFUSED");
      // Refusal is NOT a dispute and NOT an agreement
      expect(agreementStatus).not.toBe("DISPUTED");
      expect(agreementStatus).not.toBe("CONFIRMED_BY_BOTH");
    });

    it("unblocks operations review when driver refuses so warehouse workflow is never held hostage", () => {
      const readiness = evaluateReadiness({
        hasDamage: false,
        hasPhotos: false,
        hasDiscrepancy: true,
        driverAttested: false,
        driverRefused: true, // Driver refused to attest
        receiverInspected: true,
        observedQuantity: 47,
        hasQuoteProvenance: true,
      });

      // Operational invariant: driver refusal MUST NOT block warehouse review
      expect(readiness.readyForReview).toBe(true);
      expect(readiness.status).toBe("READY_FOR_OPS_REVIEW");
      expect(readiness.missingRequirements).toHaveLength(0);

      // State machine transitions cleanly to READY_FOR_OPS_REVIEW
      const nextState = transitionState("PARTY_REVIEW", "COMPLETE_EVIDENCE");
      expect(nextState).toBe("READY_FOR_OPS_REVIEW");
    });
  });

  describe("Edge Case 2: Driver Unavailable / Departed ('driver left')", () => {
    it("extracts DRIVER_UNAVAILABLE position when driver departed prior to inspection", () => {
      const departedStatements = [
        "The driver left already before we unsealed the back.",
        "Driver already took off. Discovered shortage post-delivery.",
        "Driver departed 20 minutes ago.",
        "Driver unavailable, drop trailer.",
      ];

      for (const statement of departedStatements) {
        const extracted = extractDriverAttestations(statement);
        expect(extracted.quantityPosition).toBe("DRIVER_UNAVAILABLE");
        expect(extracted.damagePosition).toBe("DRIVER_UNAVAILABLE");
      }
    });

    it("evaluates DRIVER_UNAVAILABLE agreement status and unblocks review", () => {
      const agreementStatus = evaluateAgreement("CONFIRM", "DRIVER_UNAVAILABLE");
      expect(agreementStatus).toBe("DRIVER_UNAVAILABLE");

      const readiness = evaluateReadiness({
        hasDamage: false,
        hasPhotos: false,
        hasDiscrepancy: true,
        driverAttested: false,
        driverUnavailable: true,
        receiverInspected: true,
        observedQuantity: 47,
        hasQuoteProvenance: true,
      });

      expect(readiness.readyForReview).toBe(true);
      expect(readiness.status).toBe("READY_FOR_OPS_REVIEW");
      expect(readiness.missingRequirements).toHaveLength(0);
    });
  });

  describe("Edge Case 3: Recount & Correction Invalidation (46 -> 47)", () => {
    it("recomputing count delta preserves mathematical exactness and invalidates stale discrepancy", () => {
      const expectedQty = 48;
      let observedQty = 46; // initial count
      let deltaQty = observedQty - expectedQty; // -2

      expect(deltaQty).toBe(-2);

      // Receiver corrects count after recounting pallet
      const recountTranscript = "Wait, recount! I found one more. Final count is forty-seven.";
      const extractedRecount = extractCandidateQuantity(recountTranscript);

      expect(extractedRecount).not.toBeNull();
      expect(extractedRecount?.observedQty).toBe(47);

      // Update count
      observedQty = extractedRecount!.observedQty;
      deltaQty = observedQty - expectedQty;

      expect(deltaQty).toBe(-1);
    });
  });

  describe("Edge Case 4: Silence, Non-Dock Ambient Speech & Blank Audio", () => {
    it("returns null candidate when audio contains silence, coughing, or warehouse chatter", () => {
      const nonDockUtterances = [
        "Hey Joe, where are you going for lunch?",
        "[cough] [forklift engine rumble]",
        "Yeah my shift ends at three today.",
        "Did you see the game last night?",
        "Pass me the tape gun.",
        "",
        "   ",
      ];

      for (const text of nonDockUtterances) {
        const qty = extractCandidateQuantity(text);
        expect(qty).toBeNull();

        const dmg = extractCandidateDamage(text);
        expect(dmg).toBeNull();

        const att = extractDriverAttestations(text);
        expect(att.quantityPosition).toBeUndefined();
        expect(att.damagePosition).toBeUndefined();
      }
    });
  });

  describe("Edge Case 5: Manifest Mismatch Escalation", () => {
    it("routes manifest mismatch directly to OPS_ESCALATION_REQUIRED state", () => {
      const readiness = evaluateReadiness({
        hasDamage: false,
        hasPhotos: false,
        hasDiscrepancy: false,
        driverAttested: false,
        manifestMismatch: true,
      });

      expect(readiness.readyForReview).toBe(false);
      expect(readiness.status).toBe("OPS_ESCALATION_REQUIRED");
      expect(readiness.missingRequirements[0]).toContain("Manifest mismatch detected");

      // State machine transition
      const nextState = transitionState("CAPTURING", "ESCALATE_OPS");
      expect(nextState).toBe("OPS_ESCALATION_REQUIRED");
    });
  });
});

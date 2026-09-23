import { describe, it, expect } from "vitest";
import {
  calculateDiscrepancy,
  validateFreightQuantity,
} from "@/lib/domain/quantity-engine";
import {
  evaluateAgreement,
  assertValidPosition,
} from "@/lib/domain/agreement-engine";
import { evaluateReadiness } from "@/lib/domain/readiness-engine";
import { transitionState } from "@/lib/domain/state-machine";
import { AttestationPosition, AgreementStatus } from "@/lib/types";

describe("DockWitness Repository Health & Scaffolding Smoke Test", () => {
  it("verifies vitest test runner executes properly", () => {
    expect(true).toBe(true);
  });

  describe("Deterministic Quantity Invariants", () => {
    it("computes SHORTAGE when observed < expected (Golden demo: 47 observed, 48 expected)", () => {
      const result = calculateDiscrepancy(48, 47);
      expect(result.delta).toBe(-1);
      expect(result.type).toBe("SHORTAGE");
      expect(result.magnitude).toBe(1);
    });

    it("computes OVERAGE when observed > expected", () => {
      const result = calculateDiscrepancy(48, 50);
      expect(result.delta).toBe(2);
      expect(result.type).toBe("OVERAGE");
      expect(result.magnitude).toBe(2);
    });

    it("computes null when observed == expected", () => {
      const result = calculateDiscrepancy(48, 48);
      expect(result.delta).toBe(0);
      expect(result.type).toBeNull();
      expect(result.magnitude).toBe(0);
    });

    describe("Defensive Validation Hardening", () => {
      it("throws TypeError when expectedQty is NaN", () => {
        expect(() => calculateDiscrepancy(NaN, 47)).toThrow(TypeError);
        expect(() => calculateDiscrepancy(NaN, 47)).toThrow(
          /Expected quantity must be a valid number/
        );
      });

      it("throws TypeError when observedQty is NaN", () => {
        expect(() => calculateDiscrepancy(48, NaN)).toThrow(TypeError);
        expect(() => calculateDiscrepancy(48, NaN)).toThrow(
          /Observed quantity must be a valid number/
        );
      });

      it("throws TypeError for non-number inputs", () => {
        // @ts-expect-error testing runtime validation
        expect(() => calculateDiscrepancy("48", 47)).toThrow(TypeError);
        // @ts-expect-error testing runtime validation
        expect(() => calculateDiscrepancy(48, null)).toThrow(TypeError);
        // @ts-expect-error testing runtime validation
        expect(() => calculateDiscrepancy(undefined, 47)).toThrow(TypeError);
      });

      it("throws TypeError for non-finite values (Infinity)", () => {
        expect(() => calculateDiscrepancy(Infinity, 47)).toThrow(TypeError);
        expect(() => calculateDiscrepancy(48, -Infinity)).toThrow(TypeError);
      });

      it("throws TypeError for non-integer float quantities", () => {
        expect(() => calculateDiscrepancy(48.5, 47)).toThrow(TypeError);
        expect(() => calculateDiscrepancy(48, 47.2)).toThrow(TypeError);
      });

      it("throws RangeError for negative quantities", () => {
        expect(() => calculateDiscrepancy(-1, 47)).toThrow(RangeError);
        expect(() => calculateDiscrepancy(48, -10)).toThrow(RangeError);
        expect(() => calculateDiscrepancy(48, -10)).toThrow(
          /cannot be negative/
        );
      });

      it("throws RangeError for quantities exceeding MAX_SAFE_INTEGER", () => {
        expect(() =>
          calculateDiscrepancy(Number.MAX_SAFE_INTEGER + 1, 47)
        ).toThrow(RangeError);
      });

      it("validateFreightQuantity succeeds on valid 0 and positive integers", () => {
        expect(validateFreightQuantity(0, "Count")).toBe(0);
        expect(validateFreightQuantity(48, "Count")).toBe(48);
      });
    });
  });

  describe("Deterministic Agreement Invariants (Full 16-State Truth Table)", () => {
    const truthTable: Array<{
      receiver: AttestationPosition;
      driver: AttestationPosition;
      expected: AgreementStatus;
      label: string;
    }> = [
      // 1. Both CONFIRM
      { receiver: "CONFIRM", driver: "CONFIRM", expected: "CONFIRMED_BY_BOTH", label: "Row 1: Both CONFIRM" },
      // 2-4. Active disputes
      { receiver: "CONFIRM", driver: "DISPUTE", expected: "DISPUTED", label: "Row 2: Receiver CONFIRM, Driver DISPUTE" },
      { receiver: "DISPUTE", driver: "CONFIRM", expected: "DISPUTED", label: "Row 3: Receiver DISPUTE, Driver CONFIRM" },
      { receiver: "DISPUTE", driver: "DISPUTE", expected: "DISPUTED", label: "Row 4: Both DISPUTE" },
      // 5-6. Unconfirmed by one party
      { receiver: "CONFIRM", driver: "NO_KNOWLEDGE", expected: "DISPUTED_OR_UNCONFIRMED", label: "Row 5: Receiver CONFIRM, Driver NO_KNOWLEDGE" },
      { receiver: "NO_KNOWLEDGE", driver: "CONFIRM", expected: "DISPUTED_OR_UNCONFIRMED", label: "Row 6: Receiver NO_KNOWLEDGE, Driver CONFIRM" },
      // 7-8. Dispute takes precedence over no-knowledge
      { receiver: "DISPUTE", driver: "NO_KNOWLEDGE", expected: "DISPUTED", label: "Row 7: Receiver DISPUTE, Driver NO_KNOWLEDGE" },
      { receiver: "NO_KNOWLEDGE", driver: "DISPUTE", expected: "DISPUTED", label: "Row 8: Receiver NO_KNOWLEDGE, Driver DISPUTE" },
      // 9. Both NO_KNOWLEDGE
      { receiver: "NO_KNOWLEDGE", driver: "NO_KNOWLEDGE", expected: "DISPUTED_OR_UNCONFIRMED", label: "Row 9: Both NO_KNOWLEDGE" },
      // 10-13. Single party responses with CONFIRM or DISPUTE
      { receiver: "CONFIRM", driver: "NOT_ASKED", expected: "RECEIVER_ONLY", label: "Row 10: Receiver CONFIRM, Driver NOT_ASKED" },
      { receiver: "NOT_ASKED", driver: "CONFIRM", expected: "DRIVER_ONLY", label: "Row 11: Receiver NOT_ASKED, Driver CONFIRM" },
      { receiver: "DISPUTE", driver: "NOT_ASKED", expected: "RECEIVER_ONLY", label: "Row 12: Receiver DISPUTE, Driver NOT_ASKED" },
      { receiver: "NOT_ASKED", driver: "DISPUTE", expected: "DRIVER_ONLY", label: "Row 13: Receiver NOT_ASKED, Driver DISPUTE" },
      // 14-15. Remediation Fix: NO_KNOWLEDGE with NOT_ASKED is single-party
      { receiver: "NO_KNOWLEDGE", driver: "NOT_ASKED", expected: "RECEIVER_ONLY", label: "Row 14: Receiver NO_KNOWLEDGE, Driver NOT_ASKED" },
      { receiver: "NOT_ASKED", driver: "NO_KNOWLEDGE", expected: "DRIVER_ONLY", label: "Row 15: Receiver NOT_ASKED, Driver NO_KNOWLEDGE" },
      // 16. Neither asked
      { receiver: "NOT_ASKED", driver: "NOT_ASKED", expected: "PENDING_REVIEW", label: "Row 16: Neither asked" },
    ];

    truthTable.forEach(({ receiver, driver, expected, label }) => {
      it(`correctly evaluates ${label} -> ${expected}`, () => {
        expect(evaluateAgreement(receiver, driver)).toBe(expected);
      });
    });

    describe("Agreement Input Validation", () => {
      it("throws TypeError on invalid receiver attestation position", () => {
        // @ts-expect-error testing runtime validation
        expect(() => evaluateAgreement("AGREE", "CONFIRM")).toThrow(TypeError);
        // @ts-expect-error testing runtime validation
        expect(() => evaluateAgreement("AGREE", "CONFIRM")).toThrow(
          /Invalid Receiver attestation position/
        );
      });

      it("throws TypeError on invalid driver attestation position", () => {
        // @ts-expect-error testing runtime validation
        expect(() => evaluateAgreement("CONFIRM", "UNKNOWN")).toThrow(TypeError);
        // @ts-expect-error testing runtime validation
        expect(() => evaluateAgreement("CONFIRM", "UNKNOWN")).toThrow(
          /Invalid Driver attestation position/
        );
      });

      it("assertValidPosition validates all four valid positions", () => {
        expect(() => assertValidPosition("CONFIRM", "Test")).not.toThrow();
        expect(() => assertValidPosition("DISPUTE", "Test")).not.toThrow();
        expect(() => assertValidPosition("NO_KNOWLEDGE", "Test")).not.toThrow();
        expect(() => assertValidPosition("NOT_ASKED", "Test")).not.toThrow();
      });
    });
  });

  describe("Evidence Readiness & Forbidden State Invariants", () => {
    it("requires photos when damage is reported without photos", () => {
      const readiness = evaluateReadiness({
        hasDamage: true,
        hasPhotos: false,
        hasDiscrepancy: false,
        driverAttested: false,
      });
      expect(readiness.readyForReview).toBe(false);
      expect(readiness.missingRequirements).toContain(
        "Photo evidence required for damaged items"
      );
    });

    it("throws a hard error when attempting forbidden liability transition", () => {
      expect(() => {
        // @ts-expect-error testing runtime invariant guard
        transitionState("CAPTURING", "CARRIER_LIABLE");
      }).toThrow(/Forbidden state transition/);
    });
  });
});


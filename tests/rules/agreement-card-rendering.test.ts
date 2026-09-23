import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { TwoPartyAgreementCard } from "@/components/receiving/two-party-agreement-card";

describe("TwoPartyAgreementCard SSR Empirical Rendering Probe", () => {
  it("renders AWAITING INSPECTION on packaging consensus when session is untouched (hasDamage=false, observedQty=null)", () => {
    const html = renderToString(
      React.createElement(TwoPartyAgreementCard, {
        hasDiscrepancy: false,
        expectedQty: 48,
        observedQty: null,
        delta: null,
        discrepancyType: null,
        receiverQtyPos: "NOT_ASKED",
        driverQtyPos: "NOT_ASKED",
        quantityAgreementStatus: "PENDING_REVIEW",
        hasDamage: false,
        damageDescription: null,
        receiverDmgPos: "NOT_ASKED",
        driverDmgPos: "NOT_ASKED",
        damageAgreementStatus: null,
        photoCount: 0,
      })
    );

    // Verifications:
    // 1. Must contain "AWAITING INSPECTION"
    expect(html).toContain("AWAITING INSPECTION");
    // 2. Must contain "Packaging uninspected"
    expect(html).toContain("Packaging uninspected");
    // 3. MUST NEVER contain CONFIRMED_BY_BOTH
    expect(html).not.toContain("CONFIRMED_BY_BOTH");
  });

  it("renders NO DAMAGE REPORTED (PENDING) when count is completed with no damage (hasDamage=false, observedQty=48)", () => {
    const html = renderToString(
      React.createElement(TwoPartyAgreementCard, {
        hasDiscrepancy: false,
        expectedQty: 48,
        observedQty: 48,
        delta: 0,
        discrepancyType: null,
        receiverQtyPos: "CONFIRM",
        driverQtyPos: "NOT_ASKED",
        quantityAgreementStatus: "RECEIVER_ONLY",
        hasDamage: false,
        damageDescription: null,
        receiverDmgPos: "NOT_ASKED",
        driverDmgPos: "NOT_ASKED",
        damageAgreementStatus: null,
        photoCount: 0,
      })
    );

    // Verifications:
    // 1. Must contain "NO DAMAGE REPORTED (PENDING)"
    expect(html).toContain("NO DAMAGE REPORTED (PENDING)");
    // 2. MUST NEVER contain CONFIRMED_BY_BOTH
    expect(html).not.toContain("CONFIRMED_BY_BOTH");
  });

  it("renders CONFIRMED_BY_BOTH ONLY when hasDamage=true AND receiver=CONFIRM AND driver=CONFIRM", () => {
    const html = renderToString(
      React.createElement(TwoPartyAgreementCard, {
        hasDiscrepancy: false,
        expectedQty: 48,
        observedQty: 48,
        delta: 0,
        discrepancyType: null,
        receiverQtyPos: "CONFIRM",
        driverQtyPos: "CONFIRM",
        quantityAgreementStatus: "CONFIRMED_BY_BOTH",
        hasDamage: true,
        damageDescription: "Carton 31 crushed",
        receiverDmgPos: "CONFIRM",
        driverDmgPos: "CONFIRM",
        damageAgreementStatus: "CONFIRMED_BY_BOTH",
        photoCount: 1,
      })
    );

    expect(html).toContain("CONFIRMED_BY_BOTH");
  });

  it("renders DISPUTED when damage is reported but driver disputes (hasDamage=true, driver=DISPUTE)", () => {
    const html = renderToString(
      React.createElement(TwoPartyAgreementCard, {
        hasDiscrepancy: false,
        expectedQty: 48,
        observedQty: 48,
        delta: 0,
        discrepancyType: null,
        receiverQtyPos: "CONFIRM",
        driverQtyPos: "NOT_ASKED",
        quantityAgreementStatus: "RECEIVER_ONLY",
        hasDamage: true,
        damageDescription: "Carton 31 crushed",
        receiverDmgPos: "CONFIRM",
        driverDmgPos: "DISPUTE",
        damageAgreementStatus: "DISPUTED",
        photoCount: 1,
      })
    );

    expect(html).toContain("DISPUTED");
    expect(html).not.toContain("CONFIRMED_BY_BOTH");
  });
});

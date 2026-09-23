import { describe, it, expect } from "vitest";
import { extractDriverAttestations } from "@/lib/extraction/driver-attestation-extractor";

describe("Driver Attestation Extractor: Semantic Invariants", () => {
  it("extracts Golden Demo statement correctly: Damage=CONFIRM, Shortage=DISPUTE", () => {
    const text = "I confirm the damaged carton, but I dispute the shortage. The seal was intact.";
    const result = extractDriverAttestations(text);

    expect(result.damagePosition).toBe("CONFIRM");
    expect(result.quantityPosition).toBe("DISPUTE");
    expect(result.damageQuote).toBeDefined();
    expect(result.quantityQuote).toBeDefined();
  });

  it("enforces core invariant: Uncertainty != Disagreement", () => {
    // DISPUTE cases
    const dispute1 = extractDriverAttestations("I dispute the shortage.");
    expect(dispute1.quantityPosition).toBe("DISPUTE");

    const dispute2 = extractDriverAttestations("That count is wrong.");
    expect(dispute2.quantityPosition).toBe("DISPUTE");

    const dispute3 = extractDriverAttestations("The seal was intact on arrival.");
    expect(dispute3.quantityPosition).toBe("DISPUTE");

    // NO_KNOWLEDGE cases (uncertainty, NOT dispute)
    const uncertain1 = extractDriverAttestations("I can't confirm the shortage.");
    expect(uncertain1.quantityPosition).toBe("NO_KNOWLEDGE");

    const uncertain2 = extractDriverAttestations("I don't know anything about the missing boxes.");
    expect(uncertain2.quantityPosition).toBe("NO_KNOWLEDGE");

    const uncertain3 = extractDriverAttestations("I have no knowledge of the count.");
    expect(uncertain3.quantityPosition).toBe("NO_KNOWLEDGE");
  });

  it("identifies driver refusal to attest", () => {
    const refusal1 = extractDriverAttestations("I'm not going to sign this.");
    expect(refusal1.quantityPosition).toBe("REFUSED_TO_ATTEST");
    expect(refusal1.damagePosition).toBe("REFUSED_TO_ATTEST");

    const refusal2 = extractDriverAttestations("I refuse to attest to these exceptions.");
    expect(refusal2.quantityPosition).toBe("REFUSED_TO_ATTEST");
    expect(refusal2.damagePosition).toBe("REFUSED_TO_ATTEST");
  });

  it("identifies driver unavailability or departure", () => {
    const unavail = extractDriverAttestations("Driver departed prior to count verification.");
    expect(unavail.quantityPosition).toBe("DRIVER_UNAVAILABLE");
    expect(unavail.damagePosition).toBe("DRIVER_UNAVAILABLE");
  });

  it("handles driver agreeing to both damage and count", () => {
    const agreeBoth = extractDriverAttestations("I confirm the damaged carton and I agree with the count of 47.");
    expect(agreeBoth.damagePosition).toBe("CONFIRM");
    expect(agreeBoth.quantityPosition).toBe("CONFIRM");
  });
});

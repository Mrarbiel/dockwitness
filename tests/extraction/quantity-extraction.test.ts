import { describe, it, expect } from "vitest";
import { parseSpokenNumber } from "@/lib/extraction/number-words";
import {
  extractCandidateQuantity,
  extractCandidateDamage,
} from "@/lib/extraction/quantity-extractor";
import { extractCandidates } from "@/lib/extraction";

describe("Candidate Quantity Extraction Engine", () => {
  describe("Spoken Word to Number Parser (parseSpokenNumber)", () => {
    it("parses single digit numbers (0-9)", () => {
      expect(parseSpokenNumber("zero")).toBe(0);
      expect(parseSpokenNumber("none")).toBe(0);
      expect(parseSpokenNumber("one")).toBe(1);
      expect(parseSpokenNumber("five")).toBe(5);
      expect(parseSpokenNumber("nine")).toBe(9);
    });

    it("parses teens (10-19)", () => {
      expect(parseSpokenNumber("ten")).toBe(10);
      expect(parseSpokenNumber("eleven")).toBe(11);
      expect(parseSpokenNumber("twelve")).toBe(12);
      expect(parseSpokenNumber("fourteen")).toBe(14);
      expect(parseSpokenNumber("nineteen")).toBe(19);
    });

    it("parses tens (20-90)", () => {
      expect(parseSpokenNumber("twenty")).toBe(20);
      expect(parseSpokenNumber("thirty")).toBe(30);
      expect(parseSpokenNumber("forty")).toBe(40);
      expect(parseSpokenNumber("fifty")).toBe(50);
      expect(parseSpokenNumber("sixty")).toBe(60);
      expect(parseSpokenNumber("ninety")).toBe(90);
    });

    it("parses hyphenated compound numbers", () => {
      expect(parseSpokenNumber("forty-seven")).toBe(47);
      expect(parseSpokenNumber("thirty-two")).toBe(32);
      expect(parseSpokenNumber("twenty-one")).toBe(21);
      expect(parseSpokenNumber("ninety-nine")).toBe(99);
    });

    it("parses space-separated compound numbers", () => {
      expect(parseSpokenNumber("forty seven")).toBe(47);
      expect(parseSpokenNumber("twenty five")).toBe(25);
      expect(parseSpokenNumber("thirty two")).toBe(32);
    });

    it("parses dozen idioms", () => {
      expect(parseSpokenNumber("a dozen")).toBe(12);
      expect(parseSpokenNumber("one dozen")).toBe(12);
      expect(parseSpokenNumber("half a dozen")).toBe(6);
      expect(parseSpokenNumber("two dozen")).toBe(24);
      expect(parseSpokenNumber("three dozen")).toBe(36);
    });

    it("parses hundreds and thousands", () => {
      expect(parseSpokenNumber("one hundred")).toBe(100);
      expect(parseSpokenNumber("two hundred")).toBe(200);
      expect(parseSpokenNumber("one hundred twenty-five")).toBe(125);
      expect(parseSpokenNumber("one hundred and twenty-five")).toBe(125);
      expect(parseSpokenNumber("one thousand")).toBe(1000);
    });

    it("parses numeric digits", () => {
      expect(parseSpokenNumber("47")).toBe(47);
      expect(parseSpokenNumber("50")).toBe(50);
      expect(parseSpokenNumber("1200")).toBe(1200);
      expect(parseSpokenNumber("0")).toBe(0);
    });

    it("returns null for non-number strings", () => {
      expect(parseSpokenNumber("forklift")).toBeNull();
      expect(parseSpokenNumber("banana")).toBeNull();
      expect(parseSpokenNumber("")).toBeNull();
    });
  });

  describe("Candidate Quantity Extraction (extractCandidateQuantity)", () => {
    it("extracts hyphenated spoken word count (Golden Demo)", () => {
      const text = "I have forty-seven cartons.";
      const candidate = extractCandidateQuantity(text, { speakerRole: "RECEIVER" });
      expect(candidate).not.toBeNull();
      expect(candidate!.observedQty).toBe(47);
      expect(candidate!.unit).toBe("cartons");
      expect(candidate!.speakerRole).toBe("RECEIVER");
      expect(text.slice(candidate!.startIndex, candidate!.endIndex)).toBe(candidate!.sourceQuote);
    });

    it("extracts count complete clean receipt statement", () => {
      const text = "Count complete: fifty cartons received, zero visible damage.";
      const candidate = extractCandidateQuantity(text);
      expect(candidate).not.toBeNull();
      expect(candidate!.observedQty).toBe(50);
      expect(candidate!.unit).toBe("cartons");
      expect(text.slice(candidate!.startIndex, candidate!.endIndex)).toBe(candidate!.sourceQuote);
    });

    it("extracts dozen idioms from speech", () => {
      const text = "We received two dozen boxes from the trailer.";
      const candidate = extractCandidateQuantity(text);
      expect(candidate).not.toBeNull();
      expect(candidate!.observedQty).toBe(24);
      expect(candidate!.unit).toBe("boxes");
      expect(candidate!.extractor).toBe("dozen_multiplier");
    });

    it("extracts numeric digits with packaging units", () => {
      const text = "Received 47 cartons at dock door 4.";
      const candidate = extractCandidateQuantity(text);
      expect(candidate).not.toBeNull();
      expect(candidate!.observedQty).toBe(47);
      expect(candidate!.unit).toBe("cartons");
      expect(candidate!.extractor).toBe("regex_digit");
    });

    it("disambiguates carton IDs from overall shipment count", () => {
      const text = "I counted forty-seven cartons, and carton thirty-one has crushed edges.";
      const candidate = extractCandidateQuantity(text);
      expect(candidate).not.toBeNull();
      expect(candidate!.observedQty).toBe(47);
      expect(candidate!.observedQty).not.toBe(31);
    });

    it("disambiguates manifest references from observed count", () => {
      const text = "We have thirty-two cartons on pallet, manifest is thirty.";
      const candidate = extractCandidateQuantity(text);
      expect(candidate).not.toBeNull();
      expect(candidate!.observedQty).toBe(32);
      expect(candidate!.observedQty).not.toBe(30);
    });

    it("disambiguates spoken delta mentions from observed count", () => {
      const text = "We are short one carton, count complete: forty-seven cartons.";
      const candidate = extractCandidateQuantity(text);
      expect(candidate).not.toBeNull();
      expect(candidate!.observedQty).toBe(47);
      expect(candidate!.observedQty).not.toBe(1);
    });

    it("verifies verbatim provenance highlight invariant", () => {
      const texts = [
        "I have forty-seven cartons on dock.",
        "Count complete: fifty cartons received.",
        "We have thirty-two cartons on pallet.",
        "Unloaded twenty-five cartons from the trailer.",
      ];

      for (const text of texts) {
        const candidate = extractCandidateQuantity(text);
        expect(candidate).not.toBeNull();
        expect(text.slice(candidate!.startIndex, candidate!.endIndex)).toBe(candidate!.sourceQuote);
      }
    });

    it("STRICT INVARIANT: candidate extraction NEVER calculates delta math", () => {
      const text = "I have forty-seven cartons.";
      const candidate = extractCandidateQuantity(text) as any;
      expect(candidate).not.toBeNull();
      expect(candidate.delta).toBeUndefined();
      expect(candidate.shortage).toBeUndefined();
      expect(candidate.overage).toBeUndefined();
      expect(candidate.discrepancy).toBeUndefined();
    });

    it("returns null when no quantity assertion is present", () => {
      const text = "The trailer door was stuck and the seal was already broken.";
      const candidate = extractCandidateQuantity(text);
      expect(candidate).toBeNull();
    });
  });

  describe("Candidate Damage Extraction (extractCandidateDamage)", () => {
    it("extracts damaged carton and condition", () => {
      const text = "Carton thirty-one is crushed underneath and wet on the right side.";
      const damage = extractCandidateDamage(text);
      expect(damage).not.toBeNull();
      expect(damage!.cartonReference).toContain("Carton thirty-one");
      expect(damage!.condition).toBe("crushed");
      expect(text.slice(damage!.startIndex, damage!.endIndex)).toBe(damage!.sourceQuote);
    });
  });

  describe("Unified Entry Point (extractCandidates)", () => {
    it("extracts both quantity and damage from compound turn", () => {
      const text = "I counted forty-seven cartons, and carton thirty-one has crushed edges.";
      const result = extractCandidates(text, { speakerRole: "RECEIVER" });
      expect(result.observedQty).toBe(47);
      expect(result.unit).toBe("cartons");
      expect(result.damageReported).toBe(true);
      expect(result.quantityCandidate).not.toBeNull();
      expect(result.damageCandidate).not.toBeNull();
    });
  });
});

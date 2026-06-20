import { describe, expect, it } from "vitest";

import {
  scoreCompany,
  scoreCompanyWeights,
  type ScoreCompanyInput,
} from "@/features/research/score-company";

const buildInput = (
  overrides: Partial<ScoreCompanyInput> = {},
): ScoreCompanyInput => ({
  capacityToPay: 80,
  problemMagnitude: 60,
  urgency: 40,
  solutionFit: 20,
  decisionMakerAccess: 100,
  evidenceConfidence: 50,
  ...overrides,
});

describe("scoreCompany", () => {
  it("scores strong evidence higher than speculative evidence", () => {
    const strong = scoreCompany(buildInput({ evidenceConfidence: 90 }));
    const speculative = scoreCompany(buildInput({ evidenceConfidence: 20 }));

    expect(strong.total).toBeGreaterThan(speculative.total);
    expect(speculative.explanation).toContain("evidenceConfidence");
    expect(speculative.explanation).toMatch(/uncertainty|penalty/i);
  });

  it("computes the exact weighted total", () => {
    const result = scoreCompany({
      capacityToPay: 80,
      problemMagnitude: 60,
      urgency: 40,
      solutionFit: 20,
      decisionMakerAccess: 100,
      evidenceConfidence: 50,
    });

    expect(result.total).toBe(55);
  });

  it("clamps the boundary values at all zero and all one hundred", () => {
    expect(
      scoreCompany({
        capacityToPay: 0,
        problemMagnitude: 0,
        urgency: 0,
        solutionFit: 0,
        decisionMakerAccess: 0,
        evidenceConfidence: 0,
      }).total,
    ).toBe(0);

    expect(
      scoreCompany({
        capacityToPay: 100,
        problemMagnitude: 100,
        urgency: 100,
        solutionFit: 100,
        decisionMakerAccess: 100,
        evidenceConfidence: 100,
      }).total,
    ).toBe(100);
  });

  it("rounds decimal inputs and weighted contributions to two decimals", () => {
    const result = scoreCompany({
      capacityToPay: 19.999,
      problemMagnitude: 19.999,
      urgency: 19.999,
      solutionFit: 19.999,
      decisionMakerAccess: 19.999,
      evidenceConfidence: 19.999,
    });

    expect(result.total).toBe(20);
    expect(result.components.capacityToPay.contribution).toBe(5);
    expect(result.components.problemMagnitude.contribution).toBe(5);
    expect(result.components.urgency.contribution).toBe(3);
    expect(result.components.solutionFit.contribution).toBe(4);
    expect(result.components.decisionMakerAccess.contribution).toBe(1);
    expect(result.components.evidenceConfidence.contribution).toBe(2);
  });

  it("rounds the 1.005 edge case through a direct input contribution", () => {
    const result = scoreCompany({
      capacityToPay: 4.02,
      problemMagnitude: 0,
      urgency: 0,
      solutionFit: 0,
      decisionMakerAccess: 0,
      evidenceConfidence: 0,
    });

    expect(result.total).toBe(1.01);
    expect(result.components.capacityToPay.contribution).toBe(1.01);
  });

  it.each([
    "capacityToPay",
    "problemMagnitude",
    "urgency",
    "solutionFit",
    "decisionMakerAccess",
    "evidenceConfidence",
  ] as const)("rejects invalid %s values", (field) => {
    for (const invalid of [
      -1,
      101,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "50",
      null,
      undefined,
      {},
    ]) {
      const input = buildInput() as Record<string, unknown>;
      input[field] = invalid;

      expect(() => scoreCompany(input as ScoreCompanyInput)).toThrow();
    }
  });

  it("is deterministic and does not share mutable state between calls", () => {
    const input = buildInput();
    const first = scoreCompany(input);
    const second = scoreCompany(input);

    expect(first).toEqual(second);
    expect(Object.isFrozen(scoreCompanyWeights)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.components)).toBe(true);
    expect(Object.isFrozen(first.components.capacityToPay)).toBe(true);
    expect(scoreCompanyWeights).toEqual({
      capacityToPay: 0.25,
      problemMagnitude: 0.25,
      urgency: 0.15,
      solutionFit: 0.2,
      decisionMakerAccess: 0.05,
      evidenceConfidence: 0.1,
    });

    expect(() => {
      (first.components.capacityToPay as { contribution: number }).contribution =
        999;
    }).toThrow();
    (input as { capacityToPay: number }).capacityToPay = 0;

    expect(scoreCompany(buildInput())).toEqual(second);
  });

  it("keeps component contributions approximately aligned with the total", () => {
    const result = scoreCompany({
      capacityToPay: 12.345,
      problemMagnitude: 67.891,
      urgency: 54.321,
      solutionFit: 98.765,
      decisionMakerAccess: 1.234,
      evidenceConfidence: 44.444,
    });

    const sum = Object.values(result.components).reduce(
      (total, component) => total + component.contribution,
      0,
    );

    expect(sum).toBeCloseTo(result.total, 1);
  });

  it("orders the explanation by strongest positive contributors first and breaks ties deterministically", () => {
    const result = scoreCompany({
      capacityToPay: 40,
      problemMagnitude: 20,
      urgency: 10,
      solutionFit: 25,
      decisionMakerAccess: 100,
      evidenceConfidence: 30,
    });

    expect(result.explanation).toContain("capacityToPay");
    expect(result.explanation).toContain("problemMagnitude");
    expect(result.explanation).toContain("urgency");
    expect(result.explanation).toContain("solutionFit");
    expect(result.explanation).toContain("decisionMakerAccess");
    expect(result.explanation).toContain("evidenceConfidence");
    expect(result.explanation).toMatch(/evidenceConfidence.*uncertainty/i);

    expect(result.explanation.indexOf("capacityToPay")).toBeLessThan(
      result.explanation.indexOf("problemMagnitude"),
    );
    expect(result.explanation.indexOf("problemMagnitude")).toBeLessThan(
      result.explanation.indexOf("solutionFit"),
    );
    expect(result.explanation.indexOf("solutionFit")).toBeLessThan(
      result.explanation.indexOf("decisionMakerAccess"),
    );
    expect(result.explanation.indexOf("decisionMakerAccess")).toBeLessThan(
      result.explanation.indexOf("evidenceConfidence"),
    );
    expect(result.explanation.indexOf("evidenceConfidence")).toBeLessThan(
      result.explanation.indexOf("urgency"),
    );
  });
});

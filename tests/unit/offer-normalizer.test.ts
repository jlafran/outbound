import { describe, expect, it } from "vitest";

import { normalizeOffer } from "@/features/offers/offer-normalizer";
import type { OfferInput } from "@/features/offers/offer-schema";
import { validOfferInput } from "../fixtures/offer";

describe("normalizeOffer", () => {
  it("normalizes a valid commercial offer at version 1", () => {
    expect(normalizeOffer(validOfferInput)).toEqual({
      name: "Revenue Operations Sprint",
      rawText:
        "We diagnose revenue leaks and install a focused operating system.",
      problems: ["Pipeline stalls"],
      expectedResults: ["Faster qualified pipeline"],
      ticketBand: "usd_15k_plus",
      allowedPilot: "Two-week diagnostic sprint",
      prohibitedClaims: [],
      version: 1,
    });
  });

  it("rejects raw offer text shorter than 20 characters", () => {
    expect(() =>
      normalizeOffer({ ...validOfferInput, rawText: "Too short" }),
    ).toThrow();
  });

  it("rejects an offer without problems", () => {
    const { problems: omittedProblems, ...inputWithoutProblems } =
      validOfferInput;

    void omittedProblems;

    expect(() =>
      normalizeOffer(inputWithoutProblems as OfferInput),
    ).toThrow();
  });

  it("defaults prohibited claims to an empty array", () => {
    expect(normalizeOffer(validOfferInput).prohibitedClaims).toEqual([]);
  });
});

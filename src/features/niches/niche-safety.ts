import type { NormalizedOffer } from "@/features/offers/offer-schema";

import type { NicheRecommendation } from "./niche-schema";

const rawExcerptWordCount = 8;
const groundingStopWords = new Set([
  "a",
  "and",
  "de",
  "del",
  "el",
  "en",
  "for",
  "la",
  "las",
  "los",
  "of",
  "para",
  "the",
  "to",
  "y",
]);

function normalizedWords(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .match(/[\p{Letter}\p{Number}%$+]+/gu) ?? [];
}

function normalize(value: string): string {
  return normalizedWords(value).join(" ");
}

function approvedOfferText(offer: NormalizedOffer): string {
  const ticket =
    offer.ticketBand === "usd_15k_plus"
      ? "USD 15k+"
      : "USD 5k 15k";

  return [
    offer.name,
    offer.rawText,
    ...offer.problems,
    ...offer.expectedResults,
    ticket,
    offer.allowedPilot,
  ].join(" ");
}

function containsProhibitedClaim(
  reasoning: string,
  prohibitedClaims: string[],
): boolean {
  const normalizedReasoning = normalize(reasoning);

  return prohibitedClaims.some((claim) => {
    const normalizedClaim = normalize(claim);
    return (
      normalizedClaim.length > 0 &&
      normalizedReasoning.includes(normalizedClaim)
    );
  });
}

function containsRawExcerpt(reasoning: string, rawText: string): boolean {
  const reasoningWords = normalizedWords(reasoning);
  const rawWords = normalizedWords(rawText);

  if (rawWords.length < rawExcerptWordCount) {
    return false;
  }

  const reasoningText = reasoningWords.join(" ");
  for (
    let index = 0;
    index <= rawWords.length - rawExcerptWordCount;
    index += 1
  ) {
    const excerpt = rawWords
      .slice(index, index + rawExcerptWordCount)
      .join(" ");
    if (reasoningText.includes(excerpt)) {
      return true;
    }
  }

  return false;
}

function protectedTokens(value: string): string[] {
  const words = normalizedWords(value);
  const tokens = [
    ...(value.match(/\b\d+(?:[.,]\d+)?\s*%/giu) ?? []),
    ...(value.match(
      /\b(?:usd|ars|eur|gbp)\s*[$€£]?\s*\d[\d.,]*(?:\s*[km])?\+?|[$€£]\s*\d[\d.,]*(?:\s*[km])?\+?|\b\d[\d.,]*(?:\s*[km])?\+?\s*(?:usd|ars|eur|gbp)\b/giu,
    ) ?? []),
    ...(normalize(value).match(
      /\b(?:guarantee(?:d|s)?|garant(?:ia|ias|iza|izan|izamos|izado|izada|izados|izadas)|asegura(?:r|do|da|dos|das|mos|n)?)\b/gu,
    ) ?? []),
    ...words.filter((word) => /^\d/.test(word)),
  ];

  words.forEach((word, index) => {
    if (
      /^\d/.test(word) &&
      words
        .slice(Math.max(0, index - 4), index + 5)
        .some((nearby) =>
          /^(?:ahorr|ahorro|ahorros|save|saved|saving|savings)/.test(
            nearby,
          ),
        )
    ) {
      tokens.push(word);
    }
  });

  return [...new Set(tokens.map(normalize).filter(Boolean))];
}

function containsUnsupportedProtectedToken(
  reasoning: string,
  offer: NormalizedOffer,
): boolean {
  const approvedTokens = new Set(
    protectedTokens(approvedOfferText(offer)),
  );

  return protectedTokens(reasoning).some(
    (token) => !approvedTokens.has(token),
  );
}

function isGrounded(reasoning: string, offer: NormalizedOffer): boolean {
  const normalizedReasoning = normalize(reasoning);
  const reasoningTokens = new Set(normalizedWords(reasoning));

  return [...offer.problems, ...offer.expectedResults].some(
    (grounding) => {
      const normalizedGrounding = normalize(grounding);
      if (
        normalizedGrounding.length > 0 &&
        normalizedReasoning.includes(normalizedGrounding)
      ) {
        return true;
      }

      const meaningfulTokens = normalizedWords(grounding).filter(
        (token) => token.length > 2 && !groundingStopWords.has(token),
      );
      const requiredMatches = Math.min(2, meaningfulTokens.length);

      return (
        requiredMatches > 0 &&
        meaningfulTokens.filter((token) => reasoningTokens.has(token))
          .length >= requiredMatches
      );
    },
  );
}

export function areNicheRecommendationsSafe(
  offer: NormalizedOffer,
  recommendations: NicheRecommendation[],
): boolean {
  return recommendations.every(
    ({ reasoning }) =>
      !containsProhibitedClaim(reasoning, offer.prohibitedClaims) &&
      !containsRawExcerpt(reasoning, offer.rawText) &&
      !containsUnsupportedProtectedToken(reasoning, offer) &&
      isGrounded(reasoning, offer),
  );
}

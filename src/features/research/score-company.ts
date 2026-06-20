const fieldOrder = [
  "capacityToPay",
  "problemMagnitude",
  "urgency",
  "solutionFit",
  "decisionMakerAccess",
  "evidenceConfidence",
] as const;

export const scoreCompanyWeights = Object.freeze({
  capacityToPay: 0.25,
  problemMagnitude: 0.25,
  urgency: 0.15,
  solutionFit: 0.2,
  decisionMakerAccess: 0.05,
  evidenceConfidence: 0.1,
} as const);

export type ScoreCompanyWeights = typeof scoreCompanyWeights;
export type ScoreCompanyField = keyof ScoreCompanyWeights;
export type ScoreCompanyInput = Readonly<Record<ScoreCompanyField, number>>;

export type ScoreCompanyComponent = Readonly<{
  input: number;
  weight: number;
  contribution: number;
}>;

export type ScoreCompanyResult = Readonly<{
  total: number;
  components: Readonly<Record<ScoreCompanyField, ScoreCompanyComponent>>;
  explanation: string;
}>;

const fieldOrderMap = Object.fromEntries(
  fieldOrder.map((field, index) => [field, index]),
) as Record<ScoreCompanyField, number>;

function roundToTwo(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function validateScoreValue(field: ScoreCompanyField, value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${field} must be a finite number`);
  }

  if (value < 0 || value > 100) {
    throw new RangeError(`${field} must be between 0 and 100`);
  }
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}

function freezeComponent(component: ScoreCompanyComponent): ScoreCompanyComponent {
  return Object.freeze(component);
}

function buildExplanation(
  total: number,
  components: ScoreCompanyResult["components"],
): string {
  const ordered = [...fieldOrder]
    .map((field) => ({
      field,
      ...components[field],
    }))
    .sort(
      (left, right) =>
        right.contribution - left.contribution ||
        fieldOrderMap[left.field] - fieldOrderMap[right.field],
    );

  const factorParts = ordered.map(({ field, input, weight, contribution }) => {
    const uncertainty =
      field === "evidenceConfidence" && input < 50
        ? ", uncertainty penalty"
        : "";

    return `${field}=${formatValue(input)} (weight ${weight.toFixed(2)}, contribution ${contribution.toFixed(
      2,
    )}${uncertainty})`;
  });

  return `Score ${total.toFixed(2)}. Strongest positive contributors first: ${factorParts.join(
    "; ",
  )}.`;
}

export function scoreCompany(input: ScoreCompanyInput): ScoreCompanyResult {
  for (const field of fieldOrder) {
    validateScoreValue(field, input[field]);
  }

  const components = Object.fromEntries(
    fieldOrder.map((field) => {
      const inputValue = input[field];
      const weight = scoreCompanyWeights[field];
      const contribution = roundToTwo(inputValue * weight);

      return [
        field,
        freezeComponent({
          input: inputValue,
          weight,
          contribution,
        }),
      ];
    }),
  ) as ScoreCompanyResult["components"];

  const rawTotal = fieldOrder.reduce(
    (sum, field) => sum + input[field] * scoreCompanyWeights[field],
    0,
  );

  const total = Math.min(100, Math.max(0, roundToTwo(rawTotal)));

  return Object.freeze({
    total,
    components: Object.freeze(components),
    explanation: buildExplanation(total, components),
  });
}

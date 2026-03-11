/**
 * AI Model registry with pricing, performance metrics, and cost calculators
 */

export type ModelInfo = {
  id: string;
  name: string;
  provider: "openai" | "anthropic";
  inputPrice: number; // per 1M tokens
  outputPrice: number; // per 1M tokens
  speed: number; // 1-10 bar (10 = fastest)
  thinking: number; // 1-10 bar (10 = best reasoning)
  consistency: number; // 1-10 bar (10 = most consistent)
  expensive: boolean; // show consent banner before selection
};

export const MODELS: ModelInfo[] = [
  // OpenAI models
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    provider: "openai",
    inputPrice: 2.5,
    outputPrice: 15,
    speed: 6,
    thinking: 10,
    consistency: 9,
    expensive: true,
  },
  {
    id: "gpt-5.2",
    name: "GPT-5.2",
    provider: "openai",
    inputPrice: 1.75,
    outputPrice: 14,
    speed: 7,
    thinking: 9,
    consistency: 9,
    expensive: false,
  },
  {
    id: "gpt-5",
    name: "GPT-5",
    provider: "openai",
    inputPrice: 1.25,
    outputPrice: 10,
    speed: 7,
    thinking: 9,
    consistency: 8,
    expensive: false,
  },
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    provider: "openai",
    inputPrice: 2,
    outputPrice: 8,
    speed: 8,
    thinking: 8,
    consistency: 8,
    expensive: false,
  },
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    provider: "openai",
    inputPrice: 0.4,
    outputPrice: 1.6,
    speed: 9,
    thinking: 7,
    consistency: 7,
    expensive: false,
  },

  // Anthropic models (via OpenRouter)
  {
    id: "anthropic/claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    inputPrice: 3,
    outputPrice: 15,
    speed: 7,
    thinking: 9,
    consistency: 9,
    expensive: false,
  },
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    inputPrice: 3,
    outputPrice: 15,
    speed: 7,
    thinking: 9,
    consistency: 9,
    expensive: false,
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    provider: "anthropic",
    inputPrice: 3,
    outputPrice: 15,
    speed: 7,
    thinking: 9,
    consistency: 9,
    expensive: false,
  },
  {
    id: "anthropic/claude-opus-4.1",
    name: "Claude Opus 4.1",
    provider: "anthropic",
    inputPrice: 15,
    outputPrice: 75,
    speed: 4,
    thinking: 10,
    consistency: 10,
    expensive: true,
  },
  {
    id: "anthropic/claude-opus-4.5",
    name: "Claude Opus 4.5",
    provider: "anthropic",
    inputPrice: 5,
    outputPrice: 25,
    speed: 5,
    thinking: 10,
    consistency: 10,
    expensive: false,
  },
  {
    id: "anthropic/claude-opus-4.6",
    name: "Claude Opus 4.6",
    provider: "anthropic",
    inputPrice: 5,
    outputPrice: 25,
    speed: 5,
    thinking: 10,
    consistency: 10,
    expensive: false,
  },
];

/**
 * Get model by ID
 */
export function getModel(modelId: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === modelId);
}

/**
 * Get models grouped by provider
 */
export function getModelsByProvider(): {
  openai: ModelInfo[];
  anthropic: ModelInfo[];
} {
  return {
    openai: MODELS.filter((m) => m.provider === "openai"),
    anthropic: MODELS.filter((m) => m.provider === "anthropic"),
  };
}

/**
 * Calculate AIP extraction cost
 * Typical tokens: 40k input / 5k output
 */
export function calculateAIPCost(model: ModelInfo): number {
  const inputTokens = 40_000;
  const outputTokens = 5_000;
  return (
    (inputTokens / 1_000_000) * model.inputPrice +
    (outputTokens / 1_000_000) * model.outputPrice
  );
}

/**
 * Calculate GEN rewriting cost
 * Typical tokens: 45k input / 5k output
 */
export function calculateGENCost(model: ModelInfo): number {
  const inputTokens = 45_000;
  const outputTokens = 5_000;
  return (
    (inputTokens / 1_000_000) * model.inputPrice +
    (outputTokens / 1_000_000) * model.outputPrice
  );
}

/**
 * Format cost as dollar string
 */
export function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

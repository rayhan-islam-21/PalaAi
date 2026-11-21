/** Published Anthropic prices (USD per million tokens) for the models the calculator compares. */
export type ModelPrice = { id: string; label: string; input: number; output: number; cacheRead: number };

export const MODEL_PRICES: ModelPrice[] = [
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5", input: 2, output: 10, cacheRead: 0.1 },
  { id: "claude-opus-5-5", label: "Opus 5.5", input: 4, output: 20, cacheRead: 0.2 },
];

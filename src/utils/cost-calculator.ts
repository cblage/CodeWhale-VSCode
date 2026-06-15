/**
 * Cost calculation utilities for DeepSeek models.
 *
 * Extracted from chat-provider.ts for independent testing and reuse.
 */

export interface CostEstimate {
  usd: number;
  cny: number;
}

export interface ModelPricing {
  inputCacheHitPerMillion: number;
  inputCacheMissPerMillion: number;
  outputPerMillion: number;
  inputCacheHitPerMillionCny: number;
  inputCacheMissPerMillionCny: number;
  outputPerMillionCny: number;
}

export function getModelPricing(model: string): ModelPricing | null {
  const lower = model.toLowerCase();
  if (!lower.includes("deepseek")) return null;
  const discountEnd = new Date("2026-05-31T15:59:00Z").getTime();
  const now = Date.now();
  if (lower.includes("v4-pro") || lower.includes("v4pro")) {
    if (now <= discountEnd) {
      return {
        inputCacheHitPerMillion: 0.003625, inputCacheMissPerMillion: 0.435, outputPerMillion: 0.87,
        inputCacheHitPerMillionCny: 0.025, inputCacheMissPerMillionCny: 3.0, outputPerMillionCny: 6.0,
      };
    }
    return {
      inputCacheHitPerMillion: 0.0145, inputCacheMissPerMillion: 1.74, outputPerMillion: 3.48,
      inputCacheHitPerMillionCny: 0.1, inputCacheMissPerMillionCny: 12.0, outputPerMillionCny: 24.0,
    };
  }
  return {
    inputCacheHitPerMillion: 0.0028, inputCacheMissPerMillion: 0.14, outputPerMillion: 0.28,
    inputCacheHitPerMillionCny: 0.02, inputCacheMissPerMillionCny: 1.0, outputPerMillionCny: 2.0,
  };
}

export function calculateTurnCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheHitTokens?: number,
  cacheMissTokens?: number,
  reasoningTokens?: number,
): CostEstimate | null {
  const pricing = getModelPricing(model);
  if (!pricing) return null;
  const hit = cacheHitTokens ?? 0;
  const miss = cacheMissTokens ?? Math.max(0, inputTokens - hit);
  const uncategorized = Math.max(0, inputTokens - hit - miss);
  const effectiveMiss = miss + uncategorized;
  const effectiveOutput = outputTokens + (reasoningTokens ?? 0);
  const hitCost = (hit / 1_000_000) * pricing.inputCacheHitPerMillion;
  const missCost = (effectiveMiss / 1_000_000) * pricing.inputCacheMissPerMillion;
  const outputCost = (effectiveOutput / 1_000_000) * pricing.outputPerMillion;
  const hitCostCny = (hit / 1_000_000) * pricing.inputCacheHitPerMillionCny;
  const missCostCny = (effectiveMiss / 1_000_000) * pricing.inputCacheMissPerMillionCny;
  const outputCostCny = (effectiveOutput / 1_000_000) * pricing.outputPerMillionCny;
  return {
    usd: hitCost + missCost + outputCost,
    cny: hitCostCny + missCostCny + outputCostCny,
  };
}

export function formatCostAmount(cost: number, currency: "usd" | "cny"): string {
  const symbol = currency === "usd" ? "$" : "¥";
  if (cost < 0.0001) return `<${symbol}0.0001`;
  if (cost < 0.01) return `${symbol}${cost.toFixed(4)}`;
  return `${symbol}${cost.toFixed(2)}`;
}

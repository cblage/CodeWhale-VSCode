import { describe, it, expect } from "vitest";
import {
  getModelPricing,
  calculateTurnCost,
  formatCostAmount,
  type ModelPricing,
} from "./cost-calculator";

describe("Cost calculation", () => {
  describe("getModelPricing", () => {
    it("returns null for non-DeepSeek models", () => {
      expect(getModelPricing("gpt-4")).toBeNull();
      expect(getModelPricing("claude-3")).toBeNull();
      expect(getModelPricing("")).toBeNull();
    });

    it("returns flash pricing for deepseek-v4-flash", () => {
      const pricing = getModelPricing("deepseek-v4-flash");
      expect(pricing).not.toBeNull();
      expect(pricing!.inputCacheHitPerMillion).toBe(0.0028);
      expect(pricing!.inputCacheMissPerMillion).toBe(0.14);
      expect(pricing!.outputPerMillion).toBe(0.28);
    });

    it("returns flash pricing for deepseek-chat alias", () => {
      expect(getModelPricing("deepseek-chat")).not.toBeNull();
      expect(getModelPricing("deepseek-chat")!.inputCacheMissPerMillion).toBe(0.14);
    });

    it("returns pro pricing for deepseek-v4-pro", () => {
      const pricing = getModelPricing("deepseek-v4-pro");
      expect(pricing).not.toBeNull();
    });

    it("is case-insensitive", () => {
      expect(getModelPricing("DeepSeek-V4-Pro")).not.toBeNull();
      expect(getModelPricing("DEEPSEEK-V4-FLASH")).not.toBeNull();
    });

    it("recognizes v4pro without hyphen", () => {
      const pricing = getModelPricing("deepseek-v4pro");
      expect(pricing).not.toBeNull();
    });

    it("returns CNY pricing for flash model", () => {
      const pricing = getModelPricing("deepseek-v4-flash");
      expect(pricing!.inputCacheHitPerMillionCny).toBe(0.02);
      expect(pricing!.inputCacheMissPerMillionCny).toBe(1.0);
      expect(pricing!.outputPerMillionCny).toBe(2.0);
    });

    it("returns CNY pricing for pro model", () => {
      const pricing = getModelPricing("deepseek-v4-pro");
      expect(pricing!.inputCacheHitPerMillionCny).toBeGreaterThan(0);
      expect(pricing!.inputCacheMissPerMillionCny).toBeGreaterThan(0);
      expect(pricing!.outputPerMillionCny).toBeGreaterThan(0);
    });
  });

  describe("calculateTurnCost", () => {
    it("returns null for non-DeepSeek model", () => {
      expect(calculateTurnCost("gpt-4", 1000, 500)).toBeNull();
    });

    it("calculates cost for flash model with cache hit", () => {
      const cost = calculateTurnCost("deepseek-v4-flash", 10000, 2000, 8000, 2000);
      expect(cost).not.toBeNull();
      expect(cost!.usd).toBeGreaterThan(0);
      expect(cost!.cny).toBeGreaterThan(0);
    });

    it("calculates cost for flash model without cache info", () => {
      const cost = calculateTurnCost("deepseek-v4-flash", 10000, 2000);
      expect(cost).not.toBeNull();
      expect(cost!.usd).toBeGreaterThan(0);
    });

    it("includes reasoning tokens in output cost", () => {
      const costWithoutReasoning = calculateTurnCost("deepseek-v4-flash", 1000, 500, 0, 1000);
      const costWithReasoning = calculateTurnCost("deepseek-v4-flash", 1000, 500, 0, 1000, 300);
      expect(costWithReasoning!.usd).toBeGreaterThan(costWithoutReasoning!.usd);
    });

    it("handles zero tokens", () => {
      const cost = calculateTurnCost("deepseek-v4-flash", 0, 0, 0, 0);
      expect(cost).not.toBeNull();
      expect(cost!.usd).toBe(0);
      expect(cost!.cny).toBe(0);
    });

    it("cache hit is cheaper than cache miss", () => {
      const allHit = calculateTurnCost("deepseek-v4-flash", 10000, 1000, 10000, 0);
      const allMiss = calculateTurnCost("deepseek-v4-flash", 10000, 1000, 0, 10000);
      expect(allHit!.usd).toBeLessThan(allMiss!.usd);
    });

    it("CNY cost is higher than USD cost for same tokens", () => {
      const cost = calculateTurnCost("deepseek-v4-flash", 10000, 2000, 5000, 5000);
      expect(cost!.cny).toBeGreaterThan(cost!.usd);
    });

    it("computes cache miss from input minus cache hit when cacheMissTokens omitted", () => {
      const cost = calculateTurnCost("deepseek-v4-flash", 10000, 1000, 3000);
      expect(cost).not.toBeNull();
      // 3000 cache hit + 7000 cache miss = 10000 input tokens
      expect(cost!.usd).toBeGreaterThan(0);
    });

    it("handles uncategorized tokens (input > hit + miss)", () => {
      const cost = calculateTurnCost("deepseek-v4-flash", 10000, 1000, 3000, 2000);
      expect(cost).not.toBeNull();
      // 3000 hit + 2000 miss + 5000 uncategorized = 10000
      expect(cost!.usd).toBeGreaterThan(0);
    });
  });

  describe("formatCostAmount", () => {
    it("formats very small costs with < symbol", () => {
      expect(formatCostAmount(0.00001, "usd")).toBe("<$0.0001");
      expect(formatCostAmount(0.00001, "cny")).toBe("<¥0.0001");
    });

    it("formats small costs with 4 decimal places", () => {
      expect(formatCostAmount(0.005, "usd")).toBe("$0.0050");
      expect(formatCostAmount(0.005, "cny")).toBe("¥0.0050");
    });

    it("formats normal costs with 2 decimal places", () => {
      expect(formatCostAmount(1.5, "usd")).toBe("$1.50");
      expect(formatCostAmount(12.345, "cny")).toBe("¥12.35");
    });

    it("formats zero cost", () => {
      expect(formatCostAmount(0, "usd")).toBe("<$0.0001");
    });

    it("formats large costs", () => {
      expect(formatCostAmount(100, "usd")).toBe("$100.00");
      expect(formatCostAmount(999.99, "cny")).toBe("¥999.99");
    });

    it("formats boundary at 0.0001", () => {
      expect(formatCostAmount(0.0001, "usd")).toBe("$0.0001");
      expect(formatCostAmount(0.00009, "usd")).toBe("<$0.0001");
    });

    it("formats boundary at 0.01", () => {
      expect(formatCostAmount(0.01, "usd")).toBe("$0.01");
      expect(formatCostAmount(0.0099, "usd")).toBe("$0.0099");
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  behavioralModeDisplayName,
  normalizeBehavioralMode,
} from "./runtime-mode";

describe("runtime mode labels", () => {
  it.each([
    ["act", "act", "Agent"],
    ["agent", "act", "Agent"],
    ["plan", "plan", "Planner"],
    ["planner", "plan", "Planner"],
    ["operate", "operate", "Orchestrator"],
    ["orchestrator", "operate", "Orchestrator"],
  ])("maps %s to %s / %s", (input, value, label) => {
    expect(normalizeBehavioralMode(input)).toBe(value);
    expect(behavioralModeDisplayName(input)).toBe(label);
  });
});

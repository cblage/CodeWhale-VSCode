export type BehavioralMode = "act" | "plan" | "operate";

/** Normalize Runtime API mode aliases to the three user-facing behaviors. */
export function normalizeBehavioralMode(value: string | null | undefined): BehavioralMode {
  switch ((value || "").trim().toLowerCase()) {
    case "plan":
    case "planner":
    case "2":
      return "plan";
    case "operate":
    case "operation":
    case "ops":
    case "orchestrator":
    case "3":
      return "operate";
    default:
      return "act";
  }
}

/** Human-readable labels for the Runtime API's stable mode values. */
export function behavioralModeDisplayName(
  value: string | null | undefined
): "Agent" | "Planner" | "Orchestrator" {
  switch (normalizeBehavioralMode(value)) {
    case "plan":
      return "Planner";
    case "operate":
      return "Orchestrator";
    default:
      return "Agent";
  }
}

/** Legacy Yolo remains a permission-posture alias, not a visible behavior. */
export function isLegacyBypassMode(value: string | null | undefined): boolean {
  return ["yolo", "4", "bypass", "bypass-permissions", "bypasspermissions"]
    .includes((value || "").trim().toLowerCase());
}

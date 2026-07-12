import { describe, expect, it } from "vitest";
import type { SkillEntry } from "../types";
import { stripTurnMeta } from "./diff-utils";
import {
  buildExplicitSkillPrompt,
  buildSkillCommandCatalog,
  normalizeSkillCommandName,
} from "./skill-commands";

function skill(
  name: string,
  enabled = true,
  description = "Test skill",
): SkillEntry {
  return {
    name,
    description,
    path: "/skills/" + name + "/SKILL.md",
    enabled,
    is_bundled: false,
  };
}

describe("skill command catalog", () => {
  it("normalizes path-safe skill names into slash commands", () => {
    expect(normalizeSkillCommandName("engineering-review")).toBe(
      "/engineering-review",
    );
    expect(normalizeSkillCommandName("/PDF.Tools")).toBe("/PDF.Tools");
  });

  it("rejects names the composer cannot parse as one command token", () => {
    expect(normalizeSkillCommandName("")).toBeNull();
    expect(normalizeSkillCommandName("bad name")).toBeNull();
    expect(normalizeSkillCommandName("bad/name")).toBeNull();
    expect(normalizeSkillCommandName("../escape")).toBeNull();
  });

  it("preserves API order while removing built-in collisions and duplicates", () => {
    const catalog = buildSkillCommandCatalog(
      [
        skill("engineering-review"),
        skill("HELP"),
        skill("Engineering-Review", true, "duplicate"),
        skill("disabled-skill", false),
      ],
      ["/help", "/mode"],
    );

    expect(catalog.map((entry) => entry.command)).toEqual([
      "/engineering-review",
      "/disabled-skill",
    ]);
    expect(catalog[0].description).toBe("Test skill");
    expect(catalog[1].enabled).toBe(false);
  });

  it("uses a readable fallback for an empty description", () => {
    const [entry] = buildSkillCommandCatalog(
      [skill("no-description", true, "   ")],
      [],
    );
    expect(entry.description).toBe("Run no-description skill");
  });
});

describe("explicit skill prompt", () => {
  it("requires load_skill while keeping the exact slash request recoverable", () => {
    const rawText = "/engineering-review   review #177";
    const prompt = buildExplicitSkillPrompt("engineering-review", rawText);

    expect(prompt).toContain("<turn_meta>");
    expect(prompt).toContain("load_skill");
    expect(prompt).toContain('{"name":"engineering-review"}');
    expect(stripTurnMeta(prompt)).toBe(rawText);
  });
});

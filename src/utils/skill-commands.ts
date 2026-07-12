import type { SkillEntry } from "../types";

export interface SkillCommandDescriptor {
  command: string;
  skillName: string;
  description: string;
  enabled: boolean;
}

export function normalizeSkillCommandName(name: string): string | null {
  const rawName = name.trim().replace(/^\/+/, "");
  if (!rawName || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(rawName)) {
    return null;
  }
  return "/" + rawName;
}

export function buildSkillCommandCatalog(
  skills: readonly SkillEntry[],
  reservedCommands: Iterable<string>,
): SkillCommandDescriptor[] {
  const seen = new Set(
    Array.from(reservedCommands, (command) => command.toLowerCase()),
  );
  const commands: SkillCommandDescriptor[] = [];

  for (const skill of skills) {
    const command = normalizeSkillCommandName(skill.name);
    if (!command) continue;

    const key = command.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    commands.push({
      command,
      skillName: skill.name,
      description: skill.description.trim() || "Run " + skill.name + " skill",
      enabled: skill.enabled,
    });
  }

  return commands;
}

export function buildExplicitSkillPrompt(
  skillName: string,
  rawText: string,
): string {
  const toolInput = JSON.stringify({ name: skillName });
  return [
    "<turn_meta>",
    "The user explicitly invoked the enabled skill " + JSON.stringify(skillName) + ".",
    "Before doing any work, call the load_skill tool with " + toolInput + " and follow the loaded skill instructions.",
    "Treat the slash command following this metadata as the user's request. The text after the slash-command name is its argument.",
    "</turn_meta>",
    rawText,
  ].join("\n");
}

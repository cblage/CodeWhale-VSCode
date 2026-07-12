import { describe, expect, it } from "vitest";
import { isInternalRuntimeEventText } from "./runtime-events";

describe("isInternalRuntimeEventText", () => {
  it.each([
    "<codewhale:runtime_event kind=\"subagent_completion\" visibility=\"internal\">payload</codewhale:runtime_event>",
    "  <codewhale:runtime_event visibility='INTERNAL' kind='watchdog_nudge'>payload</codewhale:runtime_event>",
    "<CODEWHALE:RUNTIME_EVENT source=\"runtime\" visibility = \"internal\" kind=\"anything_new\">payload</CODEWHALE:RUNTIME_EVENT>",
  ])("detects internal runtime transport regardless of event kind or attribute order", (text) => {
    expect(isInternalRuntimeEventText(text)).toBe(true);
  });

  it.each([
    "<codewhale:runtime_event kind=\"subagent_completion\" visibility=\"user\">payload</codewhale:runtime_event>",
    "User quoted <codewhale:runtime_event visibility=\"internal\">payload</codewhale:runtime_event>",
    "The words visibility=\"internal\" are ordinary user text",
  ])("does not hide non-internal or quoted user content", (text) => {
    expect(isInternalRuntimeEventText(text)).toBe(false);
  });
});

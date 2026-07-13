import { describe, it, expect } from "vitest";
import { getWebviewCss } from "./webview-css";

describe("webview-css.ts", () => {
  it("returns a non-empty string", () => {
    const css = getWebviewCss();
    expect(css).toBeTruthy();
    expect(css.length).toBeGreaterThan(100);
  });

  it("contains CSS variable definitions", () => {
    const css = getWebviewCss();
    expect(css).toContain("--bg:");
    expect(css).toContain("--fg:");
    expect(css).toContain("--brand-primary:");
    expect(css).toContain("--brand-primary-light:");
  });

  it("contains dark mode media query", () => {
    const css = getWebviewCss();
    expect(css).toContain("@media (prefers-color-scheme: dark)");
  });

  it("contains VS Code dark theme override", () => {
    const css = getWebviewCss();
    expect(css).toContain('body[data-vscode-theme-kind="vscode-dark"]');
  });

  it("contains key layout selectors", () => {
    const css = getWebviewCss();
    expect(css).toContain("#layout");
    expect(css).toContain("#threads-panel");
    expect(css).toContain("#sidebar-resize-handle");
    expect(css).toContain("#input-resize-handle");
    expect(css).toContain("#chat-area");
    expect(css).toContain("#messages");
    expect(css).toContain("#input-area");
    expect(css).toContain("#toolbar");
    expect(css).toContain("#settings-bar");
    expect(css).toContain("#slash-menu");
    expect(css).toContain("#ui-tooltip");
  });

  it("styles the context donut as a fixed toolbar item with threshold states", () => {
    const css = getWebviewCss();
    expect(css).toMatch(/#context-usage-gauge\s*\{[^}]*flex:\s*0 0 26px;/s);
    expect(css).toMatch(/\.context-usage-value\s*\{[^}]*stroke-dasharray:\s*100;[^}]*stroke-dashoffset:\s*100;/s);
    expect(css).toContain("#context-usage-gauge.warning");
    expect(css).toContain("#context-usage-gauge.critical");
    expect(css).toContain("#context-usage-gauge.unavailable");
  });

  it("contains message styling", () => {
    const css = getWebviewCss();
    expect(css).toContain(".message");
    expect(css).toContain(".message.user");
    expect(css).toContain(".message.assistant");
    expect(css).toContain(".thinking-block");
    expect(css).toContain(".tool-call");
    expect(css).toContain(".file-change-card");
    expect(css).toContain(".approval-bar");
  });

  it("gives interleaved subagent transcript blocks a distinct colored card", () => {
    const css = getWebviewCss();
    expect(css).toMatch(/\.subagent-transcript-block\s*\{[^}]*border-left:\s*3px solid #9b7cff;[^}]*background:\s*color-mix/s);
    expect(css).toContain(".subagent-transcript-header");
    expect(css).toContain(".subagent-transcript-name");
    expect(css).toContain(".subagent-transcript-status.active");
    expect(css).toContain(".subagent-transcript-content");
  });

  it("styles interleaved steer input like a nested user message", () => {
    const css = getWebviewCss();
    expect(css).toMatch(/\.steer-block\s*\{[^}]*margin:\s*10px 0 10px 20%;[^}]*background:\s*var\(--brand-primary\);/s);
    expect(css).toContain(".steer-block-label");
    expect(css).toContain(".steer-block-content");
  });

  it("can hide only raw agent tool cards without removing subagent transcripts", () => {
    const css = getWebviewCss();
    expect(css).toMatch(/body\.hide-agent-tool-cards \.agent-tool-card:not\(:has\(\.approval-bar\)\)\s*\{[^}]*display:\s*none !important;/s);
    expect(css).not.toContain("body.hide-agent-tool-cards .subagent-transcript-block");
  });

  it("compacts successful tool payloads while preserving failures and approvals", () => {
    const css = getWebviewCss();
    expect(css).toMatch(/body\.compact-tool-details \.tool-call:not\(\.tool-call-error\):not\(:has\(\.approval-bar\)\) > \.tool-output[\s\S]*display:\s*none !important;/);
    expect(css).toContain(".tool-call:not(.tool-call-error):not(:has(.approval-bar)) > .file-change-card");
    expect(css).not.toContain("body.compact-tool-details .tool-call-error > .tool-output");
  });

  it("positions an accessible dismiss control on sticky system notes", () => {
    const css = getWebviewCss();
    expect(css).toMatch(/\.system-message\s*\{[^}]*position:\s*relative;[^}]*padding:\s*8px 38px 8px 12px;/s);
    expect(css).toMatch(/\.system-message-dismiss\s*\{[^}]*position:\s*absolute;[^}]*right:\s*7px;[^}]*width:\s*24px;[^}]*height:\s*24px;/s);
    expect(css).toContain(".system-message-dismiss:hover");
    expect(css).toContain(".system-message-dismiss:focus-visible");
  });

  it("contains welcome screen styles", () => {
    const css = getWebviewCss();
    expect(css).toContain(".welcome-screen");
    expect(css).toContain(".welcome-brand");
    expect(css).toContain(".welcome-suggestion");
  });

  it("contains status bar styles", () => {
    const css = getWebviewCss();
    expect(css).toContain(".status-bar");
    expect(css).toContain(".stat-chip");
  });

  it("contains sidebar styles", () => {
    const css = getWebviewCss();
    expect(css).toContain(".sidebar-section");
    expect(css).toContain(".sidebar-tab");
    expect(css).toContain(".thread-item");
    expect(css).toContain(".task-card");
    expect(css).toContain(".work-section");
  });

  it("contains input and attachment styles", () => {
    const css = getWebviewCss();
    expect(css).toContain(".attachment-chip");
    expect(css).toContain("#input-row");
    expect(css).toMatch(
      /\.btn-send-stop\s*\{[^}]*align-self:\s*stretch;[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s
    );
    expect(css).toContain(".btn-send-stop.streaming.steering .btn-text-steer");
    expect(css).toContain("#attachments-area:empty { display: none; }");
    expect(css).toMatch(/#input-area\s*\{[^}]*box-sizing:\s*border-box;/s);
    expect(css).toMatch(/#input-area textarea\s*\{[^}]*box-sizing:\s*border-box;/s);
    expect(css).toMatch(
      /#input-area #btn-attach\s*\{[^}]*font-size:\s*24px;[^}]*flex:\s*0 0 44px;[^}]*align-self:\s*stretch;[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;/s
    );
    expect(css).toContain("#input-area #btn-attach .codicon { font-size: 20px; }");
  });

  it("uses equal History and Settings icon boxes without a closed-sidebar gutter", () => {
    const css = getWebviewCss();
    expect(css).toContain(
      "#threads-panel:not(.open) + #sidebar-resize-handle { display: none; }"
    );
    expect(css).toMatch(/#settings-bar\s*\{[^}]*gap:\s*8px;/s);
    expect(css).toMatch(/#settings-bar\s*\{[^}]*padding:\s*4px 8px 4px 2px;/s);
    expect(css).toMatch(
      /#settings-bar #btn-threads,\s*#settings-bar #btn-new-thread,\s*#settings-bar #btn-work-popover,\s*#settings-bar #btn-changes,\s*#settings-bar #btn-agents,\s*#settings-bar #btn-config\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;[^}]*font-size:\s*18px;[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;/s
    );
    expect(css).toContain("#settings-bar .codicon { font-size: inherit; }");
  });

  it("anchors the mutually-exclusive checklist, changes, and agent popovers to the top right", () => {
    const css = getWebviewCss();
    expect(css).toMatch(/#chat-area\s*\{[^}]*position:\s*relative;/s);
    expect(css).toMatch(/#settings-bar #btn-work-popover\s*\{[^}]*margin-left:\s*auto;[^}]*position:\s*relative;[^}]*font-size:\s*15px;/s);
    expect(css).toContain("#settings-bar #btn-work-popover:not(:disabled):hover");
    expect(css).toContain("#settings-bar #btn-changes:not(:disabled):hover");
    expect(css).toContain("#settings-bar #btn-agents:not(:disabled):hover");
    expect(css).toMatch(/#settings-bar #btn-work-popover:disabled,\s*#settings-bar #btn-changes:disabled,\s*#settings-bar #btn-agents:disabled\s*\{[^}]*cursor:\s*default;[^}]*opacity:\s*0\.45;/s);
    expect(css).toMatch(/#work-pending-badge,\s*#changes-count-badge,\s*#agent-count-badge\s*\{[^}]*position:\s*absolute;[^}]*background:\s*#d63c3c;/s);
    expect(css).toMatch(/#work-popover\s*\{[^}]*position:\s*absolute;[^}]*top:\s*36px;[^}]*right:\s*8px;[^}]*z-index:\s*900;/s);
    expect(css).toContain("#work-popover.open { display: flex; }");
    expect(css).toMatch(/\.work-popover-item\.completed \.work-popover-item-text\s*\{[^}]*text-decoration:\s*line-through;/s);
    expect(css).toContain(".work-popover-item-icon .codicon { font-size: 13px; }");
    expect(css).toMatch(/#changes-popover\s*\{[^}]*position:\s*absolute;[^}]*top:\s*36px;[^}]*right:\s*8px;[^}]*z-index:\s*900;/s);
    expect(css).toContain("#changes-popover.open { display: flex; }");
    expect(css).toMatch(/#agent-popover\s*\{[^}]*position:\s*absolute;[^}]*top:\s*36px;[^}]*right:\s*8px;[^}]*z-index:\s*900;/s);
    expect(css).toContain("#agent-popover.open { display: flex; }");
    expect(css).toContain(".agent-detail-group[open] > summary::before { content: '▼'; }");
  });

  it("removes message gutters and keeps the toolbar resize hit target out of layout", () => {
    const css = getWebviewCss();
    expect(css).toMatch(/#messages\s*\{[^}]*padding:\s*8px 0;/s);
    expect(css).toMatch(/#input-resize-handle\s*\{[^}]*height:\s*0;[^}]*flex:\s*0 0 0;/s);
    expect(css).toMatch(/#toolbar\s*\{[^}]*padding:\s*4px 8px;[^}]*align-items:\s*center;/s);
  });

  it("styles session scope and delete codicons", () => {
    const css = getWebviewCss();
    expect(css).toContain(".sidebar-section-action .codicon");
    expect(css).toMatch(/\.session-delete-btn\s*\{[^}]*color:\s*var\(--vscode-errorForeground, #f14c4c\);[^}]*font-size:\s*14px;/s);
  });

  it("vertically centers session-control labels, values, and dropdown arrows", () => {
    const css = getWebviewCss();
    expect(css).toMatch(
      /#session-controls-popover \.setting-item\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*space-between;[^}]*min-height:\s*28px;[^}]*line-height:\s*1;/s
    );
    expect(css).toMatch(
      /#session-controls-popover \.setting-label\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*height:\s*20px;[^}]*line-height:\s*1;/s
    );
    expect(css).toMatch(
      /#session-controls-popover \.setting-value\s*\{[^}]*min-height:\s*20px;[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*line-height:\s*1;/s
    );
    expect(css).toMatch(
      /#session-controls-popover \.setting-dropdown\s*\{[^}]*height:\s*20px;[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;/s
    );
    expect(css).toMatch(
      /#session-controls-popover \.setting-value::after\s*\{[^}]*content:\s*'▾';[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*line-height:\s*1;/s
    );
  });

  it("styles the bottom-right session controls dashboard and upward popover", () => {
    const css = getWebviewCss();
    expect(css).toMatch(/#toolbar #btn-session-controls\s*\{[^}]*margin-left:\s*auto;[^}]*width:\s*26px;[^}]*flex:\s*0 0 26px;[^}]*padding:\s*0;[^}]*font-size:\s*16px;/s);
    expect(css).toMatch(/#toolbar #btn-session-controls \.codicon\s*\{[^}]*margin-right:\s*0;[^}]*font-size:\s*inherit;/s);
    expect(css).toContain('#toolbar #btn-session-controls[aria-expanded="true"]');
    expect(css).toMatch(/#session-controls-popover\s*\{[^}]*display:\s*none;[^}]*position:\s*fixed;[^}]*right:\s*8px;[^}]*bottom:\s*48px;[^}]*z-index:\s*1100;/s);
    expect(css).toContain("#session-controls-popover.open { display: flex; }");
    expect(css).toMatch(/#session-controls-popover #btn-compact\s*\{[^}]*width:\s*100%;[^}]*justify-content:\s*flex-start;/s);
    expect(css).not.toContain("#toolbar .thread-count");
  });

  it("vertically centers every toolbar button in one shared height", () => {
    const css = getWebviewCss();
    expect(css).toMatch(
      /#toolbar button\s*\{[^}]*height:\s*26px;[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*line-height:\s*1;/s
    );
    expect(css).toMatch(/#toolbar button \.codicon\s*\{[^}]*margin-right:\s*4px;[^}]*font-size:\s*14px;/s);
  });

  it("styles the top-bar New session control with the other icon buttons", () => {
    const css = getWebviewCss();
    expect(css).toMatch(/#settings-bar #btn-threads,\s*#settings-bar #btn-new-thread,/s);
    expect(css).toMatch(/#settings-bar #btn-threads:hover,\s*#settings-bar #btn-new-thread:hover,/s);
    expect(css).toContain("#settings-bar #btn-new-thread .codicon { transform: translateY(1px); }");
  });

  it("keeps toolbar actions on one line at narrow sidebar widths", () => {
    const css = getWebviewCss();
    expect(css).toMatch(
      /#toolbar\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;[^}]*scrollbar-width:\s*none;/s
    );
    expect(css).toContain("#toolbar::-webkit-scrollbar { display: none; }");
    expect(css).toMatch(/#toolbar button\s*\{[^}]*flex:\s*0 0 auto;[^}]*white-space:\s*nowrap;/s);
    expect(css).toMatch(/#toolbar #btn-session-controls\s*\{[^}]*flex:\s*0 0 26px;/s);
    expect(css).not.toContain("#toolbar .thread-count");
  });

  it("styles enabled and pending agent stop controls", () => {
    const css = getWebviewCss();
    expect(css).toContain("#toolbar #btn-stop-agents:not(:disabled)");
    expect(css).toMatch(/#toolbar button:disabled\s*\{[^}]*opacity:\s*0\.45;[^}]*cursor:\s*not-allowed;/s);
    expect(css).toContain(".agent-popover-actions");
    expect(css).toContain(".agent-popover-stop");
    expect(css).toContain(".agent-popover-stop .codicon");
    expect(css).toMatch(/\.agent-popover-stop:disabled\s*\{[^}]*cursor:\s*not-allowed;/s);
  });

  it("keeps narrow session cards from colliding with their delete action", () => {
    const css = getWebviewCss();
    expect(css).toMatch(/\.thread-item\.session-item\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 24px;/s);
    expect(css).toMatch(/\.thread-item\.session-item \.thread-meta\s*\{[^}]*flex-wrap:\s*wrap;[^}]*row-gap:\s*2px;/s);
    expect(css).toMatch(/\.thread-item\.session-item \.thread-meta > span\s*\{[^}]*white-space:\s*nowrap;/s);
    expect(css).toMatch(/\.session-delete-btn\s*\{[^}]*position:\s*static;[^}]*grid-column:\s*2;[^}]*width:\s*24px;[^}]*height:\s*24px;/s);
  });

  it("contains unavailable button styles", () => {
    const css = getWebviewCss();
    expect(css).toContain(".is-unavailable");
    expect(css).toContain('[aria-disabled="true"]');
  });

  it("does not contain template literal syntax", () => {
    const css = getWebviewCss();
    expect(css).not.toContain("${");
  });
});

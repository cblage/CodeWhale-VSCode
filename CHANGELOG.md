# Change Log

## 0.4.73

### Interface

- **Compact Session Controls** — Reduce the dashboard popover to a compact
  220-pixel width and give selector, option, and Compact hover states the same
  blue accent and foreground colors as Send.

## 0.4.72

### Fixed

- **Stable Icon Tooltips** — Keep a button's custom tooltip active while the
  pointer crosses into its nested Codicon, including the Session Controls
  dashboard button.

## 0.4.71

### Fixed

- **Bulk Session Deletion** — Serialize destructive requests, deduplicate
  repeated clicks, remove confirmed rows immediately, and coalesce linked
  thread cleanup without expensive detail/summary scans.
- **Detached Runtime Reuse** — Keep an adopted live runtime bound even without
  a child-process handle, preventing load spikes from spawning a second runtime
  against the same task store.

## 0.4.70

### Fixed

- **Reliable Session Deletion** — Use the real Delete confirmation action,
  synchronize the live runtime before deleting, treat already-absent sessions
  as success, and refresh cached session/thread rows after every attempt.

## 0.4.69

### Fixed

- **Saved-Session Compact** — Resume the selected saved session before manual
  compaction instead of silently dropping the command, block duplicate compact
  starts while another turn is active, and report asynchronous start/completion
  state accurately.

## 0.4.68

### Safety

- **Agent Watchdog Opt-In** — Default the token-consuming master watchdog off,
  ignore completed worker receipts, and never create watchdog turns while the
  parent is idle.

## 0.4.67

### Interface

- **Stop All Agents Pairing** — Show `$(debug-stop)` followed by `$(robot)` on
  the Stop All Agents control, with enough width to keep both glyphs legible.

## 0.4.66

### Interface

- **Red Active-Turn Stop Button** — Give the main Stop state a red background,
  including distinct hover and pressed shades, while keeping Send and Steer on
  the normal accent color. The Steer state now includes the `$(forward)` icon.

## 0.4.44

### Interface

- **Top-Right New Session** — Move New Session between the Agents and Settings
  controls in the top-right action group.

## 0.4.43

### Interface

- **Right-Aligned Context Donut** — Move context occupancy to the far-right end
  of the bottom toolbar, immediately after the Session Controls dashboard.

## 0.4.42

### Interface

- **Cleaner Session Controls Header** — Remove the redundant dashboard glyph
  from the popover header while retaining it on the toolbar trigger.

## 0.4.41

### Interface

- **Session Controls Dashboard** — Consolidate Mode, Model, Effort, and Compact
  into an upward-opening dashboard popover in the bottom toolbar, replacing the
  session count and removing the selectors from the top bar.

## 0.4.40

### Interface

- **Aligned Top-Bar Icons** — Optically center New Session with the adjacent
  sidebar control despite the two Codicon glyphs using different ink bounds.

## 0.4.39

### Interface

- **Top-Bar New Session** — Move the New action out of the bottom toolbar and
  place an icon-only New Session control between the sidebar toggle and Mode.

## 0.4.38

### Bug Fixes

- **Context Donut Tooltip Label** — Include the context labels in the webview's
  runtime translation object and retain safe fallbacks so the tooltip never
  renders `undefined`.

## 0.4.37

### Interface

- **Context Donut** — Show the active DeepSeek thread's conservative context
  occupancy immediately before New, with live runtime updates and an exact
  tokens-used, context-maximum, and percentage tooltip.

## 0.4.36

### Interface

- **Named Subagent Profiles** — Show each worker's canonical Fleet profile alongside its coarse type in transcript cards, the Agents popover, and the agent details modal. Older profile-less run records remain supported.

## 0.4.35

### Bug Fixes

- **Changes Tooltip Translation** — Expose the Changes label to the webview runtime so badge refreshes produce `Changes (n)` instead of `undefined (n)`.

## 0.4.34

### Bug Fixes

- **Accurate Session Scope Tooltip** — Label the currently active session scope as Current workspace only or All workspaces instead of describing the opposite click action.
- **Responsive Session Cards** — Give narrow history entries a dedicated delete column and wrap metadata as whole tokens so titles, counts, timestamps, and Trash no longer collide.

## 0.4.33

### Interface

- **Focused Top Controls** — Move file changes into a badge-backed popover, use native panel, session-scope, delete, and retry icons, and shorten Reasoning Effort to Effort.
- **Edge-To-Edge Transcript** — Remove horizontal transcript padding and eliminate the resize handle's extra toolbar-row spacing while preserving its drag target.

### Bug Fixes

- **Saved Yolo Mode** — Pair with TUI 0.1337.3 so new and subsequently saved Yolo sessions retain their actual mode label instead of appearing as Agent.

## 0.4.31

### Bug Fixes

- **Single HarambeChat Title** — Contribute the same 🦍 HarambeChat label for the container and view, and remove the runtime title override that made VS Code render both as a colon-separated pair.

### Interface

- **Agent Stop Codicons** — Use Debug Stop for Stop All Agents and every individual Stop or Stopping agent action.

## 0.4.30

### Interface

- **Codicon Composer And Toolbar** — Use Attach for the composer control; Check, Broadcast, and Circle for completed, active, and waiting to-dos; and Add, Fold, Discard, and Debug Step Back for the New, Compact, Undo, and Retry toolbar actions.
- **Gorilla Title Mark** — Prefix the contributed and resolved HarambeChat title with 🦍.

## 0.4.29

### Interface

- **Native Codicon Controls** — Use VS Code's History, Checklist, Robot, Settings Gear, and Broadcast Codicons for the top controls, agent labels, and active to-do markers, with the official font bundled into the VSIX.

## 0.4.28

### Bug Fixes

- **Private Runtime Events Stay Private** — Exclude internal CodeWhale runtime-event transport messages and their adjacent turn metadata from both saved-session and runtime-thread transcript reconstruction while retaining the master's following metacognition.
- **Deterministic Transcript Restore** — Persist the selected session, runtime thread, or intentional empty view per workspace and restore that exact source after a window reload instead of silently switching reconstruction paths.

## 0.4.27

### Bug Fixes

- **Visible Master Steering** — Render accepted steer messages at their exact chronological position inside the active master transcript, keep later output below them, and restore the same order from durable runtime history.
- **Reliable Agent Cancellation UI** — Release every targeted agent from `Stopping…` when its cancellation request settles, clear the complete Stop All pending set, and bound stalled localhost cancellation requests.
- **Nested Entity Rendering** — Collapse any number of nested HTML entity wrappers to one safe display layer so Thinking and subagent transcripts show `<path>` rather than `&lt;path&gt;` without enabling raw markup.

### Interface

- **Agent Session Identity** — Show each subagent `session_name` after the model in purple transcript cards and as a Session row in the expanded agent popover.
- **Readable Token Totals** — Format per-message input and output token counts with thousands separators.

## 0.4.26

### Bug Fixes

- **Historical Subagent Placement** — Hydrate completed child transcripts into restored history before it is painted, anchor them at the parent's last agent-control boundary ahead of later master prose, and order restored purple cards chronologically by each subagent checkpoint's last update.

## 0.4.25

### Bug Fixes

- **Subagent Entity Rendering** — Preserve one valid HTML-entity layer when rendering Markdown so purple subagent transcript cards display `<gwt_initialization>` instead of the escaped text `&lt;gwt_initialization&gt;`, while continuing to escape raw markup safely.

## 0.4.24

### Interface

- **Balanced To-do Control** — Reduce the top-bar `✓` glyph to match the neighboring agent and settings controls, and rename its tooltip and popover label from Checklist to To-do.

## 0.4.23

### Bug Fixes

- **Runtime Tool Detail Settings** — Honor the runtime's `show_tool_details` and `calm_mode` values in the chat webview, compact successful tools to one-line receipts, and keep failures and approval prompts expanded.

### Interface

- **Focused History Sidebar** — Remove the redundant Work and Agents sections from History while retaining their top-bar popovers, and use the exact `✓` glyph for the checklist button.
- **Live Master Steering** — Change the active-turn Stop button to Steer whenever the composer contains non-whitespace text, route clicks and Enter directly to the current master turn, and return to Stop when the draft is cleared.

## 0.4.22

### Bug Fixes

- **Independent Agent Activity** — Keep lifecycle fallbacks live per agent instead of allowing a cached `latest_output` to freeze tool-only workers at an old step while a prose-emitting sibling continues updating.
- **Safe Artifact Retrieval** — Stop presenting runtime spillover artifacts as workspace-relative files; model-facing receipts now explicitly require `retrieve_tool_result` and warn against `read_file`.

### Interface

- **Active Agent Badge** — Count only currently active agents in the pawn button’s red badge, hide it when none are active, and keep completed agents available in the inspector.

## 0.4.21

### Bug Fixes

- **DeepSeek Thinking Compatibility** — Preserve the webview's reasoning-effort selection through the runtime API (with a runtime-config fallback), ensuring DeepSeek thinking requests omit unsupported `tool_choice` even when strict tools are enabled.
- **Deleted Sessions Stay Deleted** — Archive every runtime thread linked to a deleted session, clear the active conversation, reject late auto-save races, and skip completed orphan threads during startup while still restoring genuinely active background work.
- **Visible Request Failures** — Put provider validation errors into otherwise-empty assistant cards instead of leaving a blank response with only an `Error` footer.

### Interface

- **HarambeChat Label** — Rename the secondary-sidebar UI title to `HarambeChat` and change the composer placeholder to `Ask Harambe...`.

## 0.4.20

### Bug Fixes

- **Safe Runtime Reuse** — Ordinary activation now reuses every healthy saved runtime even when an optional API route is missing, so extension upgrades cannot kill active master or subagent work. `CodeWhale (cblage): Restart Engine` remains the explicit force-reset path and replaces detached runtimes too.
- **Accurate Agent Stop State** — Treat completed continuable checkpoints as inactive, label parked workers as needing parent action, and keep Stop controls off stale receipts whose owning runtime has ended.
- **Neutral Stale Cancellation** — Convert a runtime 409 for an inactive owning thread into one neutral already-stopped notice, retain the inactive override across unchanged receipt refreshes, and avoid repeating red cancellation failures.
- **Responsive Agent Toolbar** — Keep all toolbar actions, including `■ Stop all agents`, on one no-wrap row with horizontal overflow at narrow secondary-sidebar widths.

## 0.4.19

### Improvements

- **Direct Agent Stop** — Add a thread-scoped runtime endpoint that forwards cancellation to the owning live engine without spending model tokens or polluting the transcript.
- **Individual Stop Controls** — Show a `■ Stop` action inside each expanded active-agent row, with terminal agents protected from duplicate cancellation.
- **Stop All Agents** — Add a disabled-by-default `■ Stop all agents` toolbar control next to Retry; it activates only when the current conversation has cancellable agents and fans out direct cancellation safely.
- **Agent Activity Card Toggle** — Hide the noisy raw amber agent tool-call cards by default, with a persisted live toggle in CodeWhale Config; purple subagent transcript cards remain visible and approval prompts are never hidden.
- **Accurate Agent Card Lifecycle** — Update delegate-card status text and colors when calls complete or fail instead of leaving finished calls stuck in the yellow running state.
- **Master Agent Watchdog** — While subagents and their parent turn are active, periodically send a coalesced, non-authoritative runtime nudge so the master checks workers needing attention. The watchdog is enabled by default and its 30-second interval is configurable from 10 seconds to one hour.
- **Checklist Popover** — Add a top-bar `✔` button with an incomplete-work badge and a compact ordered checklist popover; completed todos are crossed out and opening it replaces the Agents popover.
- **Side-by-Side Runtime** — Prefer an isolated patched runtime at `~/.local/lib/codewhale-cblage/codewhale-tui`, verify its capability before reusing a detached server, and leave the official CodeWhale installation untouched.

## 0.4.18

### Bug Fixes

- **Stable Agent Nicknames** — Publish one presentation-complete agent list per refresh and retain learned nicknames across transient state-file reads, eliminating fallback-name flicker.
- **Stable Agent Ordering** — Assign each conversation agent a fixed spawn-order slot instead of re-sorting by changing activity status and `updated_at_ms` timestamps.

## 0.4.17

### Improvements

- **Live Subagent Transcript** — Mirror each visible subagent response into the main chat as it arrives, labeled `♙ Subagent "nickname"` with agent type, model, and active/inactive state.
- **True Arrival Interleaving** — Insert colored subagent cards between root-agent output blocks and continue later root output beneath them, preserving the visible order in which responses arrive.
- **Background Agent Monitoring** — Combine agent lifecycle events, atomic checkpoint-file watching, and active-run polling so detached children remain visible after their parent turn ends or a later parent turn begins.

### Bug Fixes

- **Transcript Timeline Preservation** — Key bounded checkpoint text by stable absolute message/block ordinals, updating only the latest visible child card; once root or another child output follows, later revisions append a new card so older transcript history is never rewritten.

## 0.4.16

### Bug Fixes

- **Sidebar Empty States** — Render the empty Sessions placeholder only once, replace its clipboard with `🗨`, and use `⛶` for the empty Changes placeholder.

## 0.4.15

### Bug Fixes

- **Notification Dismiss Tooltip** — Inject the missing dismiss-label translation into the webview and retain a safe fallback so sticky notification close buttons never display an `undefined` tooltip.

## 0.4.14

### Bug Fixes

- **Empty Agent Inspector** — Keep the `♙` button disabled and inert until the current conversation contains at least one agent, preventing the empty popover from flashing on click.

## 0.4.13

### Improvements

- **Floating Agent Inspector** — Add a top-bar `♙` button with an all-status agent-count badge and a fixed top-right popover with collapsed agent rows, active/inactive state, status, type, model, latest output, and Details access.
- **Conversation Agent Scope** — Match agent receipts to the currently loaded conversation through unified `agent` tool calls instead of showing unrelated workspace runs.
- **Real Nicknames and Transcript Tail** — Enrich agent receipts from the local bounded checkpoint so the UI can show the generated whale nickname, latest assistant output, and available transcript tail.
- **Agent Detail Redesign** — Replace the oversized flat modal with a compact overview and independent expandable Assignment, Transcript, Events, References, metadata, and handoff groups.

### Bug Fixes

- **Agent Receipt Schema** — Render current `status/message` lifecycle events and symbolic `{kind,name,target,description}` artifact references instead of blank legacy fields.
- **Agent UI Translations** — Inject the complete agent translation surface into the webview so modal labels no longer collapse to empty text and bare separators.
- **Unified Agent Tool** — Recognize CodeWhale's current `agent` tool for cards and receipt refreshes while preserving compatibility with legacy agent commands.

## 0.4.12

### Improvements

- **History Sidebar Symbols** — Use monochrome `♙` and `⛁` symbols for the Agents and Changes section headers.
- **Single Changes Header** — Remove the duplicated inner Changes title/count while preserving the modified-file and line summaries.
- **Aligned Settings Row** — Vertically center the Mode, Model, and Reasoning Effort labels, values, and dropdown arrows on one shared line.

## 0.4.11

### Bug Fixes

- **Valid Secondary Sidebar Container** — Use the VS Code-compatible `cblage-codewhale` container ID while retaining the isolated dotted `cblage.codewhale` namespace for commands, settings, and the chat view.

## 0.4.10

### Improvements

- **Isolated cblage Identity** — Rename the extension to `cblage.codewhale-vscode` and move its container, view, commands, configuration, panel, and diff-provider identifiers under the `cblage.codewhale` namespace so marketplace updates and the official extension cannot claim this fork.
- **Settings Migration** — Copy explicit settings from the legacy `brotherwhale` namespace once without overwriting values already configured under `cblage.codewhale`.

## 0.4.9

### Bug Fixes

- **Background Turn State** — Preserve the running conversation and Stop button while CodeWhale is hidden, and restore them from the backend after the Secondary Side Bar or webview is reopened.
- **Authoritative Running Status** — Keep ordinary status updates and the long-running-turn timer from incorrectly resetting an active conversation to Send.

## 0.4.8

### Improvements

- **Dismissible Notifications** — Sticky Note notifications now include an accessible `✕` button that dismisses only the selected notification.

## 0.4.7

### Improvements

- **Keyboard Autocomplete Navigation** — Use Up and Down to cycle through slash-command results, automatically keep the highlighted row visible, and press Tab to insert the selected command with the caret ready for its arguments without submitting it.

## 0.4.6

### New Features

- **Dynamic Skill Commands** — Discover enabled skills from `/v1/skills`, add them to slash autocomplete, and run them directly as `/<skill-name> <request>` while preserving the exact command in visible and restored history.
- **Reliable Explicit Skill Loading** — Explicit skill commands instruct the runtime to call `load_skill` with the canonical skill name before acting, while keeping command arguments as the user request.

### Bug Fixes

- **Engine Stability Across Reloads** — Persist detached-engine stdout and stderr to a file descriptor that survives extension-host reloads, preventing the first post-reload turn from crashing the engine with `Event stream error: aborted`.

## 0.4.5

### Improvements

- **Settings Controls** — Give History and Settings equal 24px icon boxes, remove the closed-sidebar resize gutter, and tighten the left inset.
- **Compact Composer Spacing** — Remove the empty attachment row and its gap when no files are attached, and correct persisted composer-height sizing.
- **Middle-Aligned Input** — Vertically center short input text while preserving normal wrapping and multiline behavior.
- **Attachment Icon** — Replace the paperclip emoji with a plain monochrome `+`.
- **Toolbar Alignment** — Give New, Compact, Undo, and Retry a shared height with flex-centered labels.

## 0.4.4

### Improvements

- **History Control** — Increase the History glyph size and tighten spacing in the settings bar.
- **Compact Composer Spacing** — Remove the empty attachment row and its gap when no files are attached, and correct persisted composer-height sizing.
- **Bottom-Aligned Input** — Keep short input text at the bottom of the textarea while preserving normal wrapping and multiline behavior.
- **Attachment Icon** — Replace the paperclip emoji with a plain monochrome `+`.

## 0.4.3

### Improvements

- **History Icon** — Replace the clipboard emoji with the `⏱` history glyph.

## 0.4.2

### Improvements

- **Aligned Composer Controls** — Stretch and center the Send/Stop button so it always matches the textarea height as the composer grows or is resized.
- **Retry Icon** — Replace the colored retry emoji with the neutral `↺` glyph.

## 0.4.1

### Improvements

- **Secondary Side Bar** — Open CodeWhale in the Secondary Side Bar and focus its chat view without replacing the primary Explorer sidebar.
- **DeepSeek Launcher Compatibility** — Reuse the `deepcode` container identity so CodeWhale can replace the previous DeepSeek extension without changing the existing launcher integration.

### Bug Fixes

- **Exit Command** — Make `/exit` close the Secondary Side Bar instead of the primary sidebar.

## 0.4.0

### New Features

- **Inline Task & Agent Detail Views** — Route task and agent sidebar interactions to inline detail overlays in the main chat webview, including richer task process/result rendering and agent run detail views. Resolve task result artifacts using the TUI task path semantics, add result preview fallback support, and remove the deprecated standalone Agent Sessions panel command and implementation.

- **Config Panel** — Add a full-featured config panel UI that reads/writes TUI runtime config via `/v1/config` and `/v1/config/reload` APIs, supporting all GUI-relevant config keys including nested-table entries (sandbox_mode, strict_tool_mode, memory_enabled, search_provider, prompt_suggestion). Accessible via the `/config` slash command or the settings bar gear icon.

### Improvements

- **Workspace-Scoped Task List** — Remove thread-level filter from refreshTaskList() so the sidebar shows all tasks across the entire workspace instead of just the active thread.

### Bug Fixes

- **Sidebar Clear on Thread Switch** — Clear sidebar tasks, agents, work, and changes panels when switching threads, preventing stale data from the previous thread from persisting into the new thread context.

## 0.3.3

### Bug Fixes

- **Textarea Height on Resize** — Reset textarea inline height when the input area is manually resized via drag handle, so the textarea fills the new container height instead of staying at its auto-grown height

- **Workspace Thread Filtering** — Filter threads by current workspace on initialization, preventing the GUI from loading the most recent thread from a different project when creating a new session

- **Thread Update Field Preservation** — Merge partial API responses with existing thread data instead of overwriting, fixing a bug where `/mode agent` would silently revert to the config default after sending a message

### Improvements

- **Work Panel Animation Simplification** — Remove interactive-style animations (shimmer, pulse, hover translate) from read-only checklist and strategy items to match the static display style of session/thread lists

## 0.3.2

### Bug Fixes

- **Apply Patch Diff Preview** — Support diff preview for apply_patch tool outputs from input patch/changes

- **Session Reset State Cleanup** — Clear stale sidebar work and changes state when resetting the webview session, so old session data does not persist into new sessions

- **Accurate Diff Line Numbers** — Separate single-diff and cumulative-diff modes: per-card diffs in reasoning sessions now show full files with correct line numbers instead of only hunk fragments

- **Diff View Line Alignment** — Align diff view line numbers with actual file positions by reverse-applying diff hunks to current file content, making it easier to correlate hunks with their real positions

## 0.3.1

### New Features

- **Thread List Visibility Setting** — Add a config option to control whether the Threads tab is shown in the sidebar (hidden by default since Sessions are the user-facing conversation list)

- **Settings Dropdowns and Panel Polish** — Clickable dropdown menus for mode, model, and reasoning effort in the settings bar; refactored work and changes panels with CSS classes; added icons to empty-state messages; improved task card styling

- **Resizable Panels and Unified Send/Stop Button** — Drag handles for sidebar width and input area height resizing; unified send/stop button that toggles based on streaming state; improved input area layout

## 0.3.0

### New Features

- **Agent Runs Sidebar** — Added an Agent Runs panel with delegate cards so background agent activity and delegated work are easier to inspect from the GUI.

- **Session Search And Delete** — The sidebar now supports searching saved sessions and removing sessions you no longer need.

### Improvements

- **Streaming Status Animation** — Replaced the old blinking cursor with pulse and bounce dot animations for a clearer streaming-state indicator.

### Bug Fixes

- **Tool Call Terminal Events** — Fixed tool call terminal event handling to prevent GUI freezes while TUI commands are running.

- **Approval Freeze And Session Duplication** — Resolved approval-flow freezes and stopped concurrent turns from creating duplicate sessions.

- **Multi-Turn Event Isolation** — Prevented stale turn events from corrupting later multi-turn conversations.

- **Changes Panel Consistency** — Fixed repeated edits to the same file so every modification appears in the Changes panel instead of only the first one.

## 0.2.0

### New Features

- **Independent Changes Panel** — Added a dedicated Changes sidebar panel so file modifications are easier to inspect during a conversation, while also reducing duplicate change entries.

- **Per-Turn Session Auto-Save** — The GUI now saves the current session after each completed turn, improving recovery and continuation across restarts.

### Improvements

- **Session Recovery Performance** — Optimized session recovery to make better use of cached state and reduce unnecessary reload work.

- **Frontend Architecture Cleanup** — Reorganized the source tree into feature-focused modules, split the webview HTML/CSS/JS into smaller units, and centralized session state and engine/API synchronization for easier maintenance.

- **History Rendering And Test Coverage** — Improved chat history rendering and expanded the automated test suite around the refactored GUI flows.

### Bug Fixes

- **Changes Panel Sync** — File changes produced by tool calls now stay in sync with the Changes panel instead of being missed or shown inconsistently.

## 0.1.2

### New Features

- **Sessions Sidebar** — Browse and resume saved sessions from the sidebar. A new "Sessions" tab sits alongside the legacy "Threads" tab, with a workspace filter toggle to show sessions from all workspaces or just the current one.

- **File Attachments** — The `/attach` command now opens a native file picker. Attach images, videos, PDFs, or any file to your message. Attachments are embedded directly into the conversation text.

- **Cross-Workspace Thread Resumption** — Loading a thread from a different workspace now automatically updates its workspace to the current one, preventing stalled conversations and misdirected output.

- **Auto-Save Threads as Sessions** — Completed conversations are automatically saved as sessions, making them available for cross-workspace resumption. Deduplication ensures each thread is saved only once.

- **Session Loading Error Handling** — Friendly error messages when a session is not found (404) or the server encounters an error, with automatic session list refresh on failure.

- **Skills Slash Command** — Added `/skills` command to list and manage available skills.

- **Runtime API Capability Detection** — GUI now probes the running TUI backend at startup to discover available API endpoints (undo, retry, snapshot restore). Features depending on unmerged upstream PRs are automatically disabled rather than failing at runtime.

- **TUI Version Display** — The status bar now shows the connected TUI backend version, helping users and maintainers understand the runtime environment at a glance.

- **Improved Unavailable-Feature UX** — Undo, Retry, and Revert buttons now show a distinct "unavailable" visual style (dashed border, muted colors) with a reliable custom tooltip explaining why the feature is not available, replacing unreliable native `title` behavior.

### Improvements

- **Trust Mode Consistency** — Yolo mode now correctly sets both `trust_mode` and `auto_approve` flags. `/trust off` preserves these flags only when in yolo mode.

- **Session Save Compatibility** — `saveThreadAsSession()` now falls back to the mainline `POST /v1/sessions` endpoint when the `/v1/sessions/save-current` route is unavailable, preventing save failures on stock TUI builds.

- **i18n** — Added Chinese and English translations for sessions, workspace filter, file attachment labels, and unavailable-feature tooltips.

## 0.1.1

- Cross-platform support for Windows and Linux
- Updated documentation to reflect config namespace and vsix filename changes

## 0.1.0

- Renamed all references from codewhale to brotherwhale
- Initial release with CodeWhale branding

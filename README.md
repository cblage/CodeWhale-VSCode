# CodeWhale for VS Code — GUI Frontend for the CodeWhale AI Agent

[![Version](https://img.shields.io/github/package-json/v/cblage/CodeWhale-VSCode?filename=package.json)](package.json)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-informational)](https://code.visualstudio.com/)

CodeWhale for VS Code is the **graphical frontend** for [CodeWhale](https://github.com/Hmbown/CodeWhale.git), a terminal-based AI coding agent. This extension wraps CodeWhale into a native VS Code sidebar experience — so you get the same full agent capabilities (reading your workspace, writing files, running commands, searching the web, managing multi-step tasks) without leaving the editor.

## 🔗 Upstream Project

This extension depends on the **CodeWhale TUI engine**. The upstream project provides the core AI agent capabilities:

- 📦 **Upstream repo**: [github.com/Hmbown/CodeWhale](https://github.com/Hmbown/CodeWhale.git)
- 🖥️ **Engine binary**: `codewhale` CLI (see [Prerequisites](#prerequisites--requirements) below)

## Preview

> TODO: Add screenshots or GIFs showing the extension in action.  
> Recommended: Chat interface, slash commands, task management, settings UI.

---

## Prerequisites / Requirements

Before using this extension, you must have the **CodeWhale engine** installed and running:

| Requirement | How to Install |
|---|---|
| **CodeWhale CLI** | `npm install -g codewhale` |
| **VS Code** | 1.85+ ([download](https://code.visualstudio.com/)) |
| **Node.js** | 18+ (required by the engine) |

The extension will attempt to locate the `codewhale` binary automatically from standard installation paths. On macOS, it may be under `/opt/homebrew/lib/node_modules/codewhale/bin/downloads/codewhale`.

> ⚠️ **Important**: This extension is a **GUI layer only** — it does not include the AI engine. The core CodeWhale engine (`codewhale` CLI) must be installed separately from the upstream project: [CodeWhale](https://github.com/Hmbown/CodeWhale.git).

---

## Features

### Agentic AI in Your Sidebar
- **Full coding agent** — CodeWhale reads, writes, and patches files, runs shell commands, searches code, and browses the web to complete your goal.
- **Four modes**: **Agent** (direct execution), **Planner** (research and design), **Yolo** (direct execution with full autonomy), and **Orchestrator** (Fleet/workflow coordination that requires a configured roster).
- **Model of your choice** — switch between models at any time (`/model`).
- **Reasoning effort control** — from `off` to `max` to balance speed and depth.

### Conversation & Thread Management
- **Threaded conversations** — organize work into separate threads with automatic history.
- **Slash commands** — `/help`, `/mode`, `/model`, `/reasoning`, `/task`, `/compact`, `/note`, `/memory`, `/export`, and dynamically discovered skill commands.
- **Context compaction** — when conversations grow long, use `/compact` to summarize and free up context window space.
- **Export & save** — export conversations for sharing or archiving.

### Workspace Integration
- **Context-aware** — CodeWhale automatically understands your open workspace, project structure, and file contents.
- **Live diff** — see file changes proposed by the agent with inline diff views.
- **File change tracking** — created, modified, and deleted files are highlighted per turn.

### Task System
- **Background tasks** — offload long-running work with `/task add <prompt>`.
- **Task sidebar** — view and manage task progress in the Tasks panel.
- **Task lifecycle** — create, view, cancel tasks without leaving the editor.

### Engine Management
- **Auto-start** — the CodeWhale engine starts automatically when the extension activates.
- **Restart on demand** — use the `CodeWhale: Restart Engine` command or `/restart` if something goes wrong.
- **Port persistence** — the engine reuses its last known port across sessions for faster startup.

### Built for VS Code
- **Secondary Side Bar integration** — CodeWhale opens on the right without replacing the Explorer.
- **Sidebar panels** — Chat, Threads, Work, and Tasks panels in the Secondary Side Bar.
- **Status bar** — model, mode, and workspace indicators.
- **Settings UI** — configure model, mode, reasoning effort, engine path, auto-approve, and more via VS Code settings.
- **Dark & light themes** — follows your VS Code theme automatically.

---

## Getting Started

### 1. Install the Engine

Open a terminal and install the `codewhale` CLI:

```bash
npm install -g codewhale
```

Verify the engine is installed:

```bash
codewhale --version
```

> The `codewhale` CLI is the AI engine that powers this extension. The [source repository](https://github.com/Hmbown/CodeWhale.git) is available if you'd like to build from source instead.

### 2. Install the Extension

**Option A — VS Code Marketplace** (recommended):
Search for "CodeWhale" in the VS Code extensions panel (`Cmd+Shift+X`) and click Install.

**Option B — Build from source**:
```bash
git clone https://github.com/HengQuWorld/CodeWhale-VSCode.git
cd CodeWhale-VSCode
npm install
npm run compile
npx @vscode/vsce package --no-dependencies
```
Then install the generated `.vsix` file from the VS Code extensions menu (`Install from VSIX...`).

### 3. Open CodeWhale

Run **CodeWhale: Open Chat** from the command palette. CodeWhale opens in the Secondary Side Bar on the right, and the engine starts automatically — you'll see a "Ready" indicator in the status bar.

### 4. Start a Conversation

Type something in the chat panel. Try your first command:

```
What files are in my project?
```

That's it. The agent reads your workspace and responds.

### Quick Commands

| Command | Description |
|---|---|
| `CodeWhale: Open Chat` | Open the CodeWhale chat panel |
| `CodeWhale: New Thread` | Start a fresh conversation |
| `CodeWhale: Compact Context` | Compact the current conversation context |
| `CodeWhale: Restart Engine` | Restart the CodeWhale engine |

### Slash Commands (in chat)

| Command | Action |
|---|---|
| `/mode [agent\|planner\|yolo\|orchestrator]` | Switch mode |
| `/model [name]` | Switch model |
| `/reasoning [auto\|off\|low\|medium\|high\|max]` | Set reasoning effort |
| `/task add <prompt>` | Create a background task |
| `/task list` | List tasks |
| `/task show <id>` | View task details |
| `/task cancel <id>` | Cancel a task |
| `/compact` | Compact conversation context |
| `/clear` | Clear chat |
| `/save` | Save conversation |
| `/export` | Export conversation |
| `/note <text>` | Add a note |
| `/memory` | Manage persistent memory |
| `/skills` | List discovered skills and their enabled state |
| `/skill <name> [on\|off]` | Enable or disable a skill |
| `/<skill-name> <request>` | Run an enabled skill explicitly |
| `/help` | Show all commands |

---

## Configuration

CodeWhale is configurable via VS Code settings (`Cmd+,` → search "cblage.codewhale").

| Setting | Default | Description |
|---|---|---|
| `cblage.codewhale.enginePath` | `"codewhale"` | Path to the codewhale binary |
| `cblage.codewhale.enginePort` | `7878` | Port for the CodeWhale runtime API |
| `cblage.codewhale.defaultModel` | `"deepseek-v4-pro"` | Default model for new threads |
| `cblage.codewhale.defaultMode` | `"act"` | Default mode (Agent / Planner / Yolo / Orchestrator) |
| `cblage.codewhale.reasoningEffort` | `"auto"` | Reasoning effort level |
| `cblage.codewhale.autoStartEngine` | `true` | Auto-start engine on activation |
| `cblage.codewhale.autoApprove` | `false` | Auto-approve tool calls independently of behavioral mode |
| `cblage.codewhale.showAgentToolCards` | `false` | Show raw agent tool-call cards; subagent transcript cards remain visible |
| `cblage.codewhale.autoWakeMasterForAgents` | `true` | Periodically nudge an active master turn to inspect running subagents; can use model tokens |
| `cblage.codewhale.agentWakeIntervalSeconds` | `30` | Seconds between agent watchdog nudges (10–3600) |

---

## Troubleshooting

### Engine fails to start
- Ensure `codewhale` is installed: `npm list -g codewhale`
- Try `CodeWhale: Restart Engine` from the command palette.
- Check the CodeWhale output channel (View → Output → CodeWhale) for error details.

### Extension does not activate
- Reload the VS Code window (`Cmd+Shift+P` → `Developer: Reload Window`).
- Ensure VS Code 1.85+ is installed.

### Engine not found
- Set the full path to the engine binary in `cblage.codewhale.enginePath`.
- Common paths: `/opt/homebrew/bin/codewhale`, `/usr/local/bin/codewhale`.
- This fork automatically prefers the isolated patched runtime at `~/.local/lib/codewhale-cblage/codewhale-tui` when present. The official `codewhale` CLI remains installed and unchanged.

### Installing the VSIX
```bash
code --install-extension /path/to/generated-extension.vsix --force
```

> **Trae CN users**: if `code` is not available, use the full path:
> ```bash
> "/Applications/Trae CN.app/Contents/Resources/app/bin/code" --install-extension /path/to/generated-extension.vsix --force
> ```

Custom extension ID: `cblage.codewhale-vscode`

Launcher command: `cblage.codewhale.openChat`

---

## Privacy & Data

CodeWhale connects to your **locally running** engine. No conversation data is sent anywhere beyond the AI model provider configured in your CodeWhale setup. You control the provider, the model, and the data flow.

---

## Development

```bash
git clone https://github.com/HengQuWorld/CodeWhale-VSCode.git
cd CodeWhale-VSCode
npm install
npm run compile   # development build with source maps
npm test          # run tests
npm run package   # production build (minified)
npx @vscode/vsce package --no-dependencies  # build VSIX
```

---

## Related Projects

- [CodeWhale](https://github.com/Hmbown/CodeWhale.git) — The upstream terminal-based AI coding agent engine that powers this extension.

---

## License

[MIT](LICENSE)

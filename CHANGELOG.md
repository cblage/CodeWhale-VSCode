# Change Log

## 0.1.2

### New Features

- **Sessions Sidebar** — Browse and resume saved sessions from the sidebar. A new "Sessions" tab sits alongside the legacy "Threads" tab, with a workspace filter toggle to show sessions from all workspaces or just the current one.

- **File Attachments** — The `/attach` command now opens a native file picker. Attach images, videos, PDFs, or any file to your message. Attachments are embedded directly into the conversation text.

- **Cross-Workspace Thread Resumption** — Loading a thread from a different workspace now automatically updates its workspace to the current one, preventing stalled conversations and misdirected output.

- **Auto-Save Threads as Sessions** — Completed conversations are automatically saved as sessions, making them available for cross-workspace resumption. Deduplication ensures each thread is saved only once.

- **Session Loading Error Handling** — Friendly error messages when a session is not found (404) or the server encounters an error, with automatic session list refresh on failure.

- **Skills Slash Command** — Added `/skills` command to list and manage available skills.

### Improvements

- **Trust Mode Consistency** — Yolo mode now correctly sets both `trust_mode` and `auto_approve` flags. `/trust off` preserves these flags only when in yolo mode.

- **i18n** — Added Chinese and English translations for sessions, workspace filter, and file attachment labels.

## 0.1.1

- Cross-platform support for Windows and Linux
- Updated documentation to reflect config namespace and vsix filename changes

## 0.1.0

- Renamed all references from codewhale to brotherwhale
- Initial release with CodeWhale branding

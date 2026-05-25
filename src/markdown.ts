import { marked } from "marked";

// Configure for chat-friendly output
marked.setOptions({
  breaks: true, // single line breaks → <br>
  gfm: true,    // tables, strikethrough, task lists, etc.
});

/**
 * Render Markdown to safe HTML for display in the webview.
 * All content from the CodeWhale / DeepSeek model is rendered through this pipeline.
 */
export function renderMarkdown(text: string): string {
  if (!text) return "";
  const safeText = escapeHtml(text);
  const result = marked.parse(safeText);
  // marked.parse is synchronous with default options
  return typeof result === "string" ? result : text;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

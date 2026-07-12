import { marked } from "marked";

// Configure for chat-friendly output
marked.use({
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
  const normalized = text.replace(
    /&(?:amp;)+(?=(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);)/gi,
    "&",
  );
  // Checkpoints and runtime receipts can cross more than one JSON/HTML
  // boundary before reaching the webview. Collapse only nested entity
  // wrappers (for example `&amp;lt;` -> `&lt;`) to one browser-decodable
  // layer. We never turn the entity into a raw angle bracket here, so marked
  // still cannot interpret model text as executable HTML.
  return normalized
    // Runtime transcripts can already contain HTML entities. Preserve one
    // valid entity layer so `&lt;tag&gt;` is not turned into the visibly escaped
    // `&amp;lt;tag&amp;gt;`. Raw angle brackets are still escaped below, so the
    // rendered webview remains safe from injected markup.
    .replace(/&(?!(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);)/gi, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Diff parsing and utility functions.
 *
 * Extracted from chat-provider.ts for independent testing and reuse.
 */

export function parseDiffStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    else if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  return { added, removed };
}

export function extractDiffFromOutput(output: string): string | undefined {
  const lines = output.split("\n");
  let diffStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("diff --git ")) { diffStart = i; break; }
    if (line.startsWith("--- ") && i + 2 < lines.length && lines[i + 1].startsWith("+++ ")) { diffStart = i; break; }
    if (line.startsWith("@@")) { diffStart = i; break; }
  }
  if (diffStart < 0) return undefined;

  let diffEnd = lines.length;
  for (let i = diffStart + 1; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : "";
    if (
      line.trim() === "" &&
      nextLine.trim() !== "" &&
      !nextLine.startsWith("+") &&
      !nextLine.startsWith("-") &&
      !nextLine.startsWith("@@") &&
      !nextLine.startsWith(" ") &&
      !nextLine.startsWith("diff ") &&
      !nextLine.startsWith("--- ") &&
      !nextLine.startsWith("+++ ") &&
      !nextLine.startsWith("index ") &&
      !nextLine.startsWith("\\")
    ) {
      diffEnd = i + 1;
      break;
    }
  }
  return lines.slice(diffStart, diffEnd).join("\n");
}

export function extractFilePathFromDiff(diff: string): string {
  for (const line of diff.split("\n")) {
    const m = line.match(/^\+\+\+ b\/(.+)$/);
    if (m) return m[1];
  }
  for (const line of diff.split("\n")) {
    const m = line.match(/^--- a\/(.+)$/);
    if (m) return m[1];
  }
  return "";
}

export function parseDiffToSides(diff: string): { oldContent: string; newContent: string } {
  const oldLines: string[] = [];
  const newLines: string[] = [];
  const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
  let inHunk = false;

  for (const line of diff.split("\n")) {
    if (hunkRegex.test(line)) {
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff ") || line.startsWith("index ")) {
      continue;
    }
    if (line.startsWith("+")) {
      newLines.push(line.slice(1));
    } else if (line.startsWith("-")) {
      oldLines.push(line.slice(1));
    } else if (line.startsWith(" ")) {
      oldLines.push(line.slice(1));
      newLines.push(line.slice(1));
    } else if (line.startsWith("\\")) {
      continue;
    } else {
      oldLines.push(line);
      newLines.push(line);
    }
  }

  if (oldLines.length === 0 && newLines.length === 0) {
    return { oldContent: "", newContent: "" };
  }
  return { oldContent: oldLines.join("\n"), newContent: newLines.join("\n") };
}

export function shortPath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/");
  return parts.length > 3 ? "…" + parts.slice(-3).join("/") : p;
}

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function stripTurnMeta(text: string): string {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<turn_meta>")) {
    const closePos = trimmed.indexOf("</turn_meta>");
    if (closePos !== -1) {
      return trimmed.slice(closePos + "</turn_meta>".length).trimStart();
    }
  }
  return trimmed;
}

/**
 * Reconstructs the old file content by reverse-applying a unified diff to the current file.
 * This ensures line numbers in the diff view match the actual file.
 *
 * @param currentContent - The current file content (new side)
 * @param diff - The unified diff string
 * @returns The reconstructed old content, or null if reconstruction fails
 */
export function reconstructOldContent(currentContent: string, diff: string): string | null {
  const currentLines = currentContent === "" ? [] : currentContent.split("\n");
  const result = [...currentLines];
  const hunkRegex = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

  // Parse all hunks from the diff
  const hunks: Array<{
    newStart: number;
    newCount: number;
    /** Lines in the hunk: each entry is [type, content] where type is ' '/'+ '/'-' */
    lines: Array<{ type: string; content: string }>;
  }> = [];

  let currentHunk: typeof hunks[0] | null = null;
  for (const line of diff.split("\n")) {
    const match = line.match(hunkRegex);
    if (match) {
      if (currentHunk) hunks.push(currentHunk);
      currentHunk = {
        newStart: parseInt(match[3], 10),
        newCount: match[4] !== undefined ? parseInt(match[4], 10) : 1,
        lines: [],
      };
    } else if (currentHunk) {
      if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("diff ") || line.startsWith("index ")) {
        continue;
      }
      if (line.startsWith("+")) {
        currentHunk.lines.push({ type: "+", content: line.slice(1) });
      } else if (line.startsWith("-")) {
        currentHunk.lines.push({ type: "-", content: line.slice(1) });
      } else if (line.startsWith(" ")) {
        currentHunk.lines.push({ type: " ", content: line.slice(1) });
      }
      // Skip "\\" lines (no newline at end of file) and other non-content lines
    }
  }
  if (currentHunk) hunks.push(currentHunk);

  // Apply hunks in reverse order (from bottom to top) to preserve line numbers
  hunks.sort((a, b) => b.newStart - a.newStart);

  for (const hunk of hunks) {
    // In the new file, this hunk occupies lines [newStart-1, newStart-1 + newCount)
    const newStartIdx = hunk.newStart - 1;

    // Build the old version of this hunk: context lines + removed lines (in order)
    const oldHunkLines: string[] = [];
    for (const h of hunk.lines) {
      if (h.type === " " || h.type === "-") {
        oldHunkLines.push(h.content);
      }
      // Skip "+" lines — they don't exist in the old version
    }

    // Replace the new-side lines with old-side lines
    result.splice(newStartIdx, hunk.newCount, ...oldHunkLines);
  }

  return result.join("\n");
}

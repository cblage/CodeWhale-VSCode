import { describe, it, expect } from "vitest";
import {
  parseDiffStats,
  extractDiffFromOutput,
  extractFilePathFromDiff,
  parseDiffToSides,
  shortPath,
  truncate,
  stripTurnMeta,
  reconstructOldContent,
} from "./diff-utils";

describe("parseDiffStats", () => {
  it("counts added and removed lines", () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,4 @@
 line1
-removed
+added1
+added2
 context`;
    const stats = parseDiffStats(diff);
    expect(stats.added).toBe(2);
    expect(stats.removed).toBe(1);
  });

  it("returns zeros for empty diff", () => {
    const stats = parseDiffStats("");
    expect(stats.added).toBe(0);
    expect(stats.removed).toBe(0);
  });

  it("ignores file header lines", () => {
    const diff = `--- a/file.ts
+++ b/file.ts`;
    const stats = parseDiffStats(diff);
    expect(stats.added).toBe(0);
    expect(stats.removed).toBe(0);
  });
});

describe("extractDiffFromOutput", () => {
  it("extracts git diff from mixed output", () => {
    const output = `Some preamble text
diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1 +1 @@
-old
+new`;
    const diff = extractDiffFromOutput(output);
    expect(diff).toBeDefined();
    expect(diff!.startsWith("diff --git")).toBe(true);
    expect(diff).toContain("-old");
    expect(diff).toContain("+new");
  });

  it("extracts unified diff starting with ---", () => {
    const output = `--- a/file.ts
+++ b/file.ts
@@ -1 +1 @@
-old
+new`;
    const diff = extractDiffFromOutput(output);
    expect(diff).toBeDefined();
  });

  it("extracts diff starting with hunk header", () => {
    const output = `@@ -1 +1 @@
-old
+new`;
    const diff = extractDiffFromOutput(output);
    expect(diff).toBeDefined();
  });

  it("returns undefined when no diff markers found", () => {
    const output = "Just some regular text\nNo diff here";
    expect(extractDiffFromOutput(output)).toBeUndefined();
  });

  it("stops at prose after diff content", () => {
    const output = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1 +1 @@
-old
+new

This is a summary paragraph that should not be included.`;
    const diff = extractDiffFromOutput(output);
    expect(diff).toBeDefined();
    expect(diff).not.toContain("summary paragraph");
  });
});

describe("extractFilePathFromDiff", () => {
  it("extracts file path from +++ line", () => {
    const diff = `--- a/src/main.ts
+++ b/src/main.ts
@@ -1 +1 @@
-old
+new`;
    expect(extractFilePathFromDiff(diff)).toBe("src/main.ts");
  });

  it("falls back to --- line when +++ is missing", () => {
    const diff = `--- a/src/main.ts
@@ -1 +1 @@
-old`;
    expect(extractFilePathFromDiff(diff)).toBe("src/main.ts");
  });

  it("returns empty string when no path found", () => {
    const diff = `@@ -1 +1 @@
-old
+new`;
    expect(extractFilePathFromDiff(diff)).toBe("");
  });
});

describe("parseDiffToSides", () => {
  it("separates old and new content from a diff", () => {
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 line1
-old line
+new line
 line3`;
    const result = parseDiffToSides(diff);
    expect(result.oldContent).toContain("old line");
    expect(result.oldContent).toContain("line1");
    expect(result.oldContent).toContain("line3");
    expect(result.newContent).toContain("new line");
    expect(result.newContent).toContain("line1");
    expect(result.newContent).toContain("line3");
  });

  it("returns empty strings for empty diff", () => {
    const result = parseDiffToSides("");
    expect(result.oldContent).toBe("");
    expect(result.newContent).toBe("");
  });

  it("handles diff with only additions", () => {
    const diff = `@@ -0,0 +1,2 @@
+line1
+line2`;
    const result = parseDiffToSides(diff);
    expect(result.newContent).toContain("line1");
    expect(result.newContent).toContain("line2");
  });

  it("handles diff with only deletions", () => {
    const diff = `@@ -1,2 +0,0 @@
-line1
-line2`;
    const result = parseDiffToSides(diff);
    expect(result.oldContent).toContain("line1");
    expect(result.oldContent).toContain("line2");
  });

  it("skips no-newline-at-end marker", () => {
    const diff = `@@ -1 +1 @@
-old
\\ No newline at end of file
+new
\\ No newline at end of file`;
    const result = parseDiffToSides(diff);
    expect(result.oldContent).toContain("old");
    expect(result.newContent).toContain("new");
    expect(result.oldContent).not.toContain("No newline");
    expect(result.newContent).not.toContain("No newline");
  });
});

describe("shortPath", () => {
  it("returns short paths unchanged", () => {
    expect(shortPath("src/main.ts")).toBe("src/main.ts");
  });

  it("abbreviates long paths", () => {
    // /very/long/path/to/src/main.ts → 6 parts → last 3 = to/src/main.ts
    expect(shortPath("/very/long/path/to/src/main.ts")).toBe("…to/src/main.ts");
  });

  it("handles Windows-style paths", () => {
    // C:\Users\dev\project\src\main.ts → after replace → C:/Users/dev/project/src/main.ts → 6 parts → last 3
    expect(shortPath("C:\\Users\\dev\\project\\src\\main.ts")).toBe("…project/src/main.ts");
  });

  it("handles exactly 3 parts", () => {
    expect(shortPath("a/b/c")).toBe("a/b/c");
  });

  it("handles 4 parts", () => {
    // a/b/c/d → 4 parts > 3 → last 3 = b/c/d
    expect(shortPath("a/b/c/d")).toBe("…b/c/d");
  });
});

describe("truncate", () => {
  it("returns short strings unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates long strings with ellipsis", () => {
    expect(truncate("hello world", 8)).toBe("hello w…");
  });

  it("handles exact length", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });
});

describe("stripTurnMeta", () => {
  it("strips turn_meta tags from the beginning", () => {
    const text = "<turn_meta>some metadata</turn_meta>Actual content here";
    expect(stripTurnMeta(text)).toBe("Actual content here");
  });

  it("returns text unchanged when no turn_meta", () => {
    const text = "Just regular content";
    expect(stripTurnMeta(text)).toBe("Just regular content");
  });

  it("handles leading whitespace before turn_meta", () => {
    const text = "  <turn_meta>meta</turn_meta>Content";
    expect(stripTurnMeta(text)).toBe("Content");
  });

  it("does not strip turn_meta from the middle", () => {
    const text = "Content <turn_meta>meta</turn_meta> more content";
    expect(stripTurnMeta(text)).toBe("Content <turn_meta>meta</turn_meta> more content");
  });

  it("handles unclosed turn_meta tag", () => {
    const text = "<turn_meta>unclosed content";
    expect(stripTurnMeta(text)).toBe("<turn_meta>unclosed content");
  });
});

describe("reconstructOldContent", () => {
  it("reconstructs old content from simple diff", () => {
    const currentContent = "line1\nnew line\nline3";
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 line1
-old line
+new line
 line3`;
    const result = reconstructOldContent(currentContent, diff);
    expect(result).toBe("line1\nold line\nline3");
  });

  it("handles multiple hunks", () => {
    const currentContent = "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10";
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,3 @@
 line1
-line2
+line2_modified
 line3
@@ -8,3 +8,3 @@
 line8
-line9
+line9_modified
 line10`;
    const result = reconstructOldContent(currentContent, diff);
    expect(result).toBe("line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9\nline10");
  });

  it("handles additions", () => {
    // Diff adds a line between line1 and line2
    // New side: line1, added_line, line2
    const currentContent = "line1\nadded_line\nline2";
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,3 @@
 line1
+added_line
 line2`;
    const result = reconstructOldContent(currentContent, diff);
    expect(result).toBe("line1\nline2");
  });

  it("handles deletions", () => {
    // Diff removes deleted_line between line1 and line2
    // New side: line1, line2
    const currentContent = "line1\nline2";
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,3 +1,2 @@
 line1
-deleted_line
 line2`;
    const result = reconstructOldContent(currentContent, diff);
    expect(result).toBe("line1\ndeleted_line\nline2");
  });

  it("preserves lines outside hunk range", () => {
    // File has 5 lines, hunk only modifies lines 2-3
    const currentContent = "line1\nmodified\nline3\nline4\nline5";
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -2,2 +2,2 @@
-original
+modified
 line3`;
    const result = reconstructOldContent(currentContent, diff);
    expect(result).toBe("line1\noriginal\nline3\nline4\nline5");
  });

  it("handles new file diff (old side is empty)", () => {
    // New file with 3 lines
    const currentContent = "line1\nline2\nline3";
    const diff = `diff --git a/newfile.ts b/newfile.ts
--- /dev/null
+++ b/newfile.ts
@@ -0,0 +1,3 @@
+line1
+line2
+line3`;
    const result = reconstructOldContent(currentContent, diff);
    expect(result).toBe("");
  });

  it("handles deleted file diff (new side is empty)", () => {
    // File was deleted entirely
    const currentContent = "";
    const diff = `diff --git a/oldfile.ts b/oldfile.ts
--- a/oldfile.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-line1
-line2
-line3`;
    const result = reconstructOldContent(currentContent, diff);
    expect(result).toBe("line1\nline2\nline3");
  });

  it("handles diff with no newline at end of file marker", () => {
    const currentContent = "line1\nnew line";
    const diff = `diff --git a/file.ts b/file.ts
--- a/file.ts
+++ b/file.ts
@@ -1,2 +1,2 @@
 line1
-old line
\\ No newline at end of file
+new line
\\ No newline at end of file`;
    const result = reconstructOldContent(currentContent, diff);
    expect(result).toBe("line1\nold line");
  });
});

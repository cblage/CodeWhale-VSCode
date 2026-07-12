import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown HTML entity handling", () => {
  it("does not double-escape entities already present in subagent output", () => {
    const html = renderMarkdown(
      "Feed the &lt;gwt_initialization&gt; element to the verifier.",
    );

    expect(html).toContain("&lt;gwt_initialization&gt;");
    expect(html).not.toContain("&amp;lt;gwt_initialization&amp;gt;");
  });

  it("collapses repeatedly escaped entities to one safe display layer", () => {
    const html = renderMarkdown(
      "Run --scratchpad &amp;amp;amp;amp;amp;lt;path&amp;amp;amp;amp;amp;gt; after &amp;lt;init&amp;gt;.",
    );

    expect(html).toContain("--scratchpad &lt;path&gt;");
    expect(html).toContain("after &lt;init&gt;");
    expect(html).not.toContain("&amp;lt;path&amp;gt;");
  });

  it("keeps nested escaped markup inert after normalization", () => {
    const html = renderMarkdown("&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;");

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("still escapes raw markup and bare ampersands", () => {
    const html = renderMarkdown("<script>alert(1)</script> A & B");

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("A &amp; B");
  });
});

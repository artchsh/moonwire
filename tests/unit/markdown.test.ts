import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../../src/client/components/markdown";

describe("renderMarkdown", () => {
  it("escapes HTML to prevent XSS", () => {
    const html = renderMarkdown('<img src=x onerror="alert(1)">');
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("renders headings, bold, and lists", () => {
    expect(renderMarkdown("# Title")).toContain("<h1>Title</h1>");
    expect(renderMarkdown("**bold**")).toContain("<strong>bold</strong>");
    const list = renderMarkdown("- one\n- two");
    expect(list).toContain("<ul>");
    expect(list).toContain("<li>one</li>");
  });

  it("linkifies http(s) urls only", () => {
    expect(renderMarkdown("see https://example.com")).toContain('href="https://example.com"');
  });
});

import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

// Keep in step with ALLOWED_TAGS / ALLOWED_ATTRIBUTES in Backend/bryo/html_clean.py. The server removes anything
// else from an event description, so if the editor ever starts producing a new tag, formatting would silently
// vanish from saved events. This test turns that into a failure here instead.
const SERVER_KEEPS = new Set(["p", "br", "hr", "strong", "b", "em", "i", "u", "s", "code", "pre", "blockquote", "ul", "ol", "li", "h2", "h3", "a"]);
const HARMLESS_ATTRIBUTES = new Set(["href", "class", "target", "rel"]); // class/target/rel are dropped or re-set by the server

const SAMPLE = `
  <h2>Agenda</h2><h3>Details</h3>
  <p>Come <strong>early</strong>, <em>hear</em> <s>old</s> <u>news</u> and <code>code</code>
     <a href="https://example.com/plan?a=1&b=2">the plan</a>.<br>Second line</p>
  <ul><li>One</li><li>Two<ul><li>Nested</li></ul></li></ul>
  <ol><li>First</li></ol>
  <blockquote><p>Quote</p></blockquote>
  <pre><code>x = 1</code></pre>
  <hr>
`;

function editorHtml(content) {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] } })],
    content,
  });
  const html = editor.getHTML();
  editor.destroy();
  return html;
}

describe("what the event editor produces", () => {
  it("only uses tags the server keeps", () => {
    const doc = new DOMParser().parseFromString(editorHtml(SAMPLE), "text/html");
    const tags = new Set([...doc.body.querySelectorAll("*")].map((el) => el.tagName.toLowerCase()));
    const unexpected = [...tags].filter((t) => !SERVER_KEEPS.has(t));
    expect(unexpected).toEqual([]);
    for (const wanted of ["h2", "h3", "p", "strong", "em", "ul", "ol", "li", "blockquote", "pre", "code", "a"]) {
      expect(tags.has(wanted), `the editor should still make <${wanted}>`).toBe(true);
    }
  });

  it("only puts harmless attributes on its tags", () => {
    const doc = new DOMParser().parseFromString(editorHtml(SAMPLE), "text/html");
    const attrs = new Set([...doc.body.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((a) => a.name)));
    expect([...attrs].filter((a) => !HARMLESS_ATTRIBUTES.has(a))).toEqual([]);
  });

  it("does not let a script or handler through the editor itself", () => {
    const html = editorHtml('<p>hi</p><img src=x onerror="alert(1)"><script>alert(1)</script><a href="javascript:alert(1)">x</a>');
    expect(html.toLowerCase()).not.toMatch(/<script|onerror|<img|javascript:/);
  });
});

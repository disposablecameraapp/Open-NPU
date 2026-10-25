import { describe, expect, it } from "vitest";
import { groupArtifacts } from "../src/core/artifactGroups";
import type { Artifact } from "../src/shared/types";

const art = (id: string, title: string, kind: Artifact["kind"], language: string, chat = "c1", updated = 1): Artifact => ({
  id, title, kind, language, content: "x", projectId: null, source: { type: "chat", conversationId: chat }, created: 1, updated
});

describe("groupArtifacts", () => {
  it("puts the files of one site in one group, home page first", () => {
    const out = groupArtifacts([art("a", "style.css", "code", "css", "c1", 5), art("b", "index.html", "html", "html"), art("c", "app.js", "code", "javascript"), art("d", "Notes", "markdown", "markdown")]);
    expect(out).toHaveLength(2);
    const g = out[0];
    expect(g.t).toBe("group");
    if (g.t === "group") { expect(g.files.map((f) => f.id)).toEqual(["b", "c", "a"]); expect(g.updated).toBe(5); }
    expect(out[1].t).toBe("single");
  });
  it("leaves a lone page and scripts without a page alone", () => {
    expect(groupArtifacts([art("a", "x.html", "html", "html")]).every((e) => e.t === "single")).toBe(true);
    expect(groupArtifacts([art("a", "a.js", "code", "javascript"), art("b", "b.css", "code", "css")]).every((e) => e.t === "single")).toBe(true);
  });
  it("does not mix chats", () => {
    expect(groupArtifacts([art("a", "a.html", "html", "html", "c1"), art("b", "b.css", "code", "css", "c2")]).every((e) => e.t === "single")).toBe(true);
  });
});

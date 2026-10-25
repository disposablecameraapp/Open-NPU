import { describe, expect, it } from "vitest";
import { describePrompt, describers, imageBlock, imageKey, imageLost, imagesOf, swapImages } from "../src/core/vision";
import { refusal } from "../src/core/attachments";
import type { CatalogEntry, ChatMessage } from "../src/shared/types";

const entry = (id: string, sizeGB: number) => ({ id, name: id, repo: id, sizeGB } as unknown as CatalogEntry);
const withImage = (text: string, ...urls: string[]): ChatMessage => ({ role: "user", content: [...urls.map((u) => ({ type: "image_url" as const, image_url: { url: u } })), { type: "text" as const, text }] });

describe("images for a model that cannot see", () => {
  it("finds every image of a conversation", () => {
    const m: ChatMessage[] = [{ role: "system", content: "x" }, withImage("look", "data:a", "data:b"), { role: "assistant", content: "ok" }, withImage("again", "data:c")];
    expect(imagesOf(m).map((r) => [r.message, r.part, r.url])).toEqual([[1, 0, "data:a"], [1, 1, "data:b"], [3, 0, "data:c"]]);
    expect(imagesOf([{ role: "user", content: "no image" }])).toEqual([]);
  });

  it("replaces each image by its description, in the message, so the model reads it as part of what was said", () => {
    const m: ChatMessage[] = [withImage("why is this broken?", "data:a")];
    const out = swapImages(m, (_, n) => imageBlock(n, "A snake game with an empty board.", "Qwen-VL"));
    expect(out[0].content).toBe("[Image 1, described by Qwen-VL because you cannot see images. What follows is everything known about it.]\nA snake game with an empty board.\n[End of image 1]\n\nwhy is this broken?");
    expect(imagesOf(out)).toEqual([]);
    expect(swapImages([withImage("x", "data:z")], (_, n) => imageLost(n, "no model"))[0].content).toMatch(/Image 1 was attached but could not be read: no model/);
  });

  it("keeps a short key for an image, the same each time and different between images", () => {
    const a = "data:image/png;base64," + "A".repeat(50000), b = "data:image/png;base64," + "A".repeat(49999) + "B";
    expect(imageKey(a)).toBe(imageKey(a));
    expect(imageKey(a)).not.toBe(imageKey(b));
    expect(imageKey(a).length).toBeLessThan(30);
  });

  it("asks the describer with the user's own words, so it looks at what matters", () => {
    expect(describePrompt("why is the snake stuck?")).toContain("why is the snake stuck?");
    expect(describePrompt("")).toBe("Describe this image.");
  });

  it("picks, among the installed models that see, the preferred one, then the loaded one, then the smallest", () => {
    const vl4 = entry("qwen3-vl-4b", 3), vl2 = entry("qwen3-vl-2b", 1.5), text = entry("llama-3.2-3b", 2), pref = entry("gemma-3-4b", 3.2);
    expect(describers([vl4, text, vl2], null).map((e) => e.id)).toEqual(["qwen3-vl-2b", "qwen3-vl-4b"]);
    expect(describers([vl4, text, vl2], vl4).map((e) => e.id)).toEqual(["qwen3-vl-4b", "qwen3-vl-2b"]);
    expect(describers([vl4, vl2, pref], vl4, [pref]).map((e) => e.id)).toEqual(["gemma-3-4b", "qwen3-vl-4b", "qwen3-vl-2b"]);
    expect(describers([text], null)).toEqual([]);
  });

  it("an image is always accepted; only its size can refuse it", () => {
    expect(refusal({ name: "a.png", size: 1000, type: "image/png" }, true)).toBeNull();
    expect(refusal({ name: "a.png", size: 7 * 1024 ** 2, type: "image/png" }, true)).toMatch(/larger than/);
  });
});

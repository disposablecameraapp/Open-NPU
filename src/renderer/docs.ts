import { api } from "./api";
import { LEGACY_DOC, LEGACY_NOTE, READABLE_DOC, documentText } from "../core/officeRead";

const MAX_CHARS = 1_000_000;

/** A Word, Excel, PowerPoint, OpenDocument or RTF file as text the model can read. Old formats go through an office suite on this PC when there is one. Throws a readable reason. */
export async function readDocument(f: File): Promise<string> {
  let name = f.name;
  let bytes: Uint8Array = new Uint8Array(await f.arrayBuffer());
  if (LEGACY_DOC.test(name) && !READABLE_DOC.test(name)) {
    const c = await api().convertLegacyDoc(name, bytes).catch(() => null);
    if (!c) throw new Error(LEGACY_NOTE(name));
    name = c.name;
    bytes = c.bytes;
  }
  const { text } = await documentText(name, bytes);
  if (!text.trim()) throw new Error(`${f.name}: there is no text in it.`);
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n[… cut: the document is longer than ${MAX_CHARS} characters]` : text;
}

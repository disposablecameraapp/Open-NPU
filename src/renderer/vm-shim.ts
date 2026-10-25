/**
 * The window has no Node `vm`, and its content policy forbids building functions from text, so a script cannot be parsed
 * here. This stands in for it where the build pipeline runs in a browser for the preview: it never reports a syntax error.
 */
export class Script {
  constructor(_code?: string, _options?: unknown) { /* nothing to parse with */ }
}
export default { Script };

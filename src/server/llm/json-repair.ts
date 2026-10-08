/**
 * Extracts the first balanced JSON object/array from model output.
 * Handles ```json fences, leading prose, and <think> blocks.
 */
export function extractJson(text: string): unknown | undefined {
  let t = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "");
  // Prefer fenced block if present
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1];
  t = t.trim();

  const start = t.search(/[{[]/);
  if (start === -1) return undefined;
  const src = t.slice(start);
  const open = src[0];
  const close = open === "{" ? "}" : "]";

  // Walk to matching close, respecting strings/escapes.
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) {
        const candidate = src.slice(0, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return undefined;
        }
      }
    }
  }
  // Fallback: try whole remainder (truncated output)
  try {
    return JSON.parse(src);
  } catch {
    return undefined;
  }
}

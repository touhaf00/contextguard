export function extractJson<T>(
  text: string
): T {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("{");

  if (start === -1) {
    throw new Error(
      "Agent response does not contain JSON."
    );
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (
    let index = start;
    index < cleaned.length;
    index++
  ) {
    const character = cleaned[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (
      character === "\\" &&
      inString
    ) {
      escaped = true;
      continue;
    }

    if (character === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (character === "{") {
      depth++;
    }

    if (character === "}") {
      depth--;

      if (depth === 0) {
        return JSON.parse(
          cleaned.slice(start, index + 1)
        ) as T;
      }
    }
  }

  throw new Error(
    "Agent response contains incomplete JSON."
  );
}

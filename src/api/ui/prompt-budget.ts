export const COMINTY_MESSAGE_LIMIT = 30000;

export const PROMPT_BUDGET = 28000;

export const MIN_BLOCK_CHARS = 900;

export class PromptTooLargeError extends Error {
  constructor(
    public readonly length: number,
    public readonly budget: number
  ) {
    super(
      `PROMPT_TOO_LARGE: the agent prompt needs at least ${length} characters, the budget is ${budget}.`
    );
  }
}

export interface PromptSection {
  name: string;
  text: string;
  shrinkable: boolean;
  alternatives?: string[];
}

export interface ShortenedSection {
  name: string;
  from: number;
  to: number;
  mode?: "brief" | "cut";
}

export interface FittedPrompt {
  prompt: string;
  original_length: number;
  shortened: ShortenedSection[];
}

function omissionNote(omitted: number): string {
  return (
    `\n[ContextGuard shortened this evidence block: ${omitted} characters were omitted from its middle ` +
    "to fit the agent message limit. Anything in the omitted part is NOT observed; " +
    "a claim that needs it must stay UNKNOWN or unverified.]\n"
  );
}

export function shortenMiddle(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const room = Math.max(0, limit - omissionNote(text.length).length);
  const headBudget = Math.floor(room * 0.7);
  const tailBudget = room - headBudget;

  let head = text.slice(0, headBudget);
  const lastBreak = head.lastIndexOf("\n");
  if (lastBreak >= headBudget - 200 && lastBreak > 0) head = head.slice(0, lastBreak);

  let tail = tailBudget > 0 ? text.slice(text.length - tailBudget) : "";
  const firstBreak = tail.indexOf("\n");
  if (firstBreak >= 0 && firstBreak <= 200) tail = tail.slice(firstBreak + 1);

  const omitted = text.length - head.length - tail.length;
  return head + omissionNote(omitted) + tail;
}

export function fitPrompt(
  base: string,
  sections: PromptSection[],
  budget: number = PROMPT_BUDGET
): FittedPrompt {
  const total = base.length + sections.reduce((sum, section) => sum + section.text.length, 0);
  if (total <= budget) {
    return {
      prompt: base + sections.map(section => section.text).join(""),
      original_length: total,
      shortened: []
    };
  }

  const original = sections;
  const briefed: ShortenedSection[] = [];
  let current = sections;
  const depth = Math.max(0, ...sections.map(section => section.alternatives?.length ?? 0));
  for (let step = 0; step < depth; step++) {
    current = current.map(section => {
      const alternative = section.alternatives?.[step];
      return alternative !== undefined && alternative.length < section.text.length
        ? { ...section, text: alternative }
        : section;
    });
    if (base.length + current.reduce((sum, section) => sum + section.text.length, 0) <= budget) break;
  }
  const lengthOf = (list: PromptSection[]): number =>
    base.length + list.reduce((sum, section) => sum + section.text.length, 0);
  current.forEach((section, index) => {
    if (section.text !== original[index].text) {
      briefed.push({ name: section.name, from: original[index].text.length, to: section.text.length, mode: "brief" });
    }
  });
  if (lengthOf(current) <= budget) {
    return { prompt: base + current.map(section => section.text).join(""), original_length: total, shortened: briefed };
  }

  const fixed =
    base.length +
    current.filter(section => !section.shrinkable).reduce((sum, section) => sum + section.text.length, 0);
  const shrinkable = current.filter(section => section.shrinkable && section.text.length > 0);
  const floor = fixed + shrinkable.reduce((sum, section) => sum + Math.min(section.text.length, MIN_BLOCK_CHARS), 0);
  if (floor > budget) throw new PromptTooLargeError(floor, budget);

  const sizeWithCap = (cap: number): number =>
    fixed + shrinkable.reduce((sum, section) => sum + Math.min(section.text.length, cap), 0);

  let low = MIN_BLOCK_CHARS;
  let high = Math.max(...shrinkable.map(section => section.text.length));
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (sizeWithCap(middle) <= budget) low = middle;
    else high = middle - 1;
  }
  const cap = low;

  const shortened: ShortenedSection[] = [];
  const parts = current.map((section, index) => {
    if (!section.shrinkable || section.text.length <= cap) return section.text;
    const text = shortenMiddle(section.text, cap);
    shortened.push({ name: section.name, from: original[index].text.length, to: text.length, mode: "cut" });
    return text;
  });

  for (const entry of briefed) {
    if (!shortened.some(item => item.name === entry.name)) shortened.push(entry);
  }
  return { prompt: base + parts.join(""), original_length: total, shortened };
}

export function fitMessageToLimit(message: string, limit: number = COMINTY_MESSAGE_LIMIT - 1000): string {
  return message.length <= limit ? message : shortenMiddle(message, limit);
}

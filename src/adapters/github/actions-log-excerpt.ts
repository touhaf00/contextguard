export interface LogExcerptBlock {
  first_line_number: number;
  line_numbers: number[];
  lines: string[];
}

export interface LogExcerpt {
  error_annotation_count: number;
  blocks: LogExcerptBlock[];
  excerpt_truncated: boolean;
}

export const LOG_EXCERPT_MAX_BLOCKS = 6;
export const LOG_EXCERPT_MAX_LINES = 24;
export const LOG_EXCERPT_MAX_CHARS = 3500;
export const LOG_EXCERPT_LINE_MAX = 300;
const CONTEXT_LINES_BEFORE = 2;

const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\s?/;
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f\u0080-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g;

const REDACTIONS: Array<[RegExp, string]> = [
  [/github_pat_[A-Za-z0-9_]{20,}/g, "[redacted-token]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "[redacted-token]"],
  [/\bsk-[A-Za-z0-9_-]{20,}/g, "[redacted-token]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[redacted-token]"],
  [/\b(Bearer|token)\s+[A-Za-z0-9._~+\/=-]{20,}/gi, "$1 [redacted]"],
  [/(https?:\/\/)[^\s\/:@]+:[^\s\/@]+@/gi, "$1[redacted]@"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/g, "[redacted-private-key]"]
];

export function sanitizeLogLine(raw: string): string {
  let line = raw
    .replace(/^\uFEFF/, "")
    .replace(TIMESTAMP, "")
    .replace(ANSI, "")
    .replace(/\t/g, " ")
    .replace(CONTROL, "")
    .replace(/\s+$/, "");
  for (const [pattern, replacement] of REDACTIONS) {
    line = line.replace(pattern, replacement);
  }
  return line.length > LOG_EXCERPT_LINE_MAX
    ? `${line.slice(0, LOG_EXCERPT_LINE_MAX)}…`
    : line;
}

const ERROR_ANNOTATION = /^##\[error\]/;
const STRUCTURAL = /^##\[(?:group|endgroup)\]/;

export function extractErrorExcerpt(logText: string): LogExcerpt {
  const lines = logText.split(/\r?\n/).map(sanitizeLogLine);
  const annotationIndexes: number[] = [];
  lines.forEach((line, index) => {
    if (ERROR_ANNOTATION.test(line)) annotationIndexes.push(index);
  });

  const blocks: LogExcerptBlock[] = [];
  let totalLines = 0;
  let totalChars = 0;
  let truncated = false;
  let lastIncluded = -1;

  for (const index of annotationIndexes) {
    const collected: Array<{ number: number; text: string }> = [];
    for (let back = index - 1; back >= 0 && collected.length < CONTEXT_LINES_BEFORE; back--) {
      if (back <= lastIncluded) break;
      const candidate = lines[back];
      if (!candidate || STRUCTURAL.test(candidate)) continue;
      collected.unshift({ number: back + 1, text: candidate });
    }
    collected.push({ number: index + 1, text: lines[index] });

    const cost = collected.reduce((sum, item) => sum + item.text.length, 0);
    if (
      blocks.length >= LOG_EXCERPT_MAX_BLOCKS ||
      totalLines + collected.length > LOG_EXCERPT_MAX_LINES ||
      totalChars + cost > LOG_EXCERPT_MAX_CHARS
    ) {
      truncated = true;
      break;
    }
    blocks.push({
      first_line_number: collected[0].number,
      line_numbers: collected.map(item => item.number),
      lines: collected.map(item => item.text)
    });
    totalLines += collected.length;
    totalChars += cost;
    lastIncluded = index;
  }

  return {
    error_annotation_count: annotationIndexes.length,
    blocks,
    excerpt_truncated: truncated
  };
}

export interface FailureOutputLine {
  line_number: number;
  text: string;
}

export interface FailureOutput {
  lines: FailureOutputLine[];
  truncated: boolean;
}

export const FAILURE_OUTPUT_MAX_LINES = 30;
export const FAILURE_OUTPUT_MAX_CHARS = 4000;

const FAILURE_LINE: RegExp[] = [
  /^(?:FAIL|ERROR): \S/,
  /\.\.\. (?:ok|FAIL|ERROR|skipped\b.*)$/,
  /^Traceback \(most recent call last\):/,
  /^\s*File ".+", line \d+(?:, in .+)?$/,
  /^[A-Za-z_][A-Za-z0-9_.]*(?:Error|Exception|Failure)\b(?::|$)/,
  /^E {2,}\S/,
  /^(?:FAILED|PASSED|ERROR)\b/,
  /^OK(?: \(.*\))?$/,
  /^Ran \d+ tests? in\b/,
  /^=+ .*\b(?:failed|passed|error|errors)\b.* =+$/i,
  /^(?:Tests?|Test Suites):\s+\d/,
  /^npm ERR! /
];
const TRACEBACK_FRAME = /^\s*File ".+", line \d+/;

export function extractFailureOutput(logText: string): FailureOutput {
  const lines = logText.split(/\r?\n/).map(sanitizeLogLine);
  const kept: FailureOutputLine[] = [];
  const seen = new Set<number>();
  let chars = 0;
  let truncated = false;

  const take = (index: number): boolean => {
    if (seen.has(index)) return true;
    const text = lines[index];
    if (kept.length >= FAILURE_OUTPUT_MAX_LINES || chars + text.length > FAILURE_OUTPUT_MAX_CHARS) {
      truncated = true;
      return false;
    }
    seen.add(index);
    kept.push({ line_number: index + 1, text });
    chars += text.length;
    return true;
  };

  for (let index = 0; index < lines.length; index++) {
    const text = lines[index];
    if (!text || ERROR_ANNOTATION.test(text) || STRUCTURAL.test(text)) continue;
    if (!FAILURE_LINE.some(pattern => pattern.test(text))) continue;
    if (!take(index)) break;
    if (TRACEBACK_FRAME.test(text)) {
      const next = lines[index + 1];
      if (next && !ERROR_ANNOTATION.test(next) && !STRUCTURAL.test(next) &&
          !FAILURE_LINE.some(pattern => pattern.test(next)) && !take(index + 1)) break;
    }
  }
  return { lines: kept, truncated };
}

import { createHash } from 'node:crypto';

export type DiffApplyResult =
  | { ok: true; after: string }
  | { ok: false; reason: string };

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/;
const PREFACE = /^(?:diff --git |index [0-9a-f]+\.\.[0-9a-f]+)/;
const NO_NEWLINE = '\\ No newline at end of file';
const MAX_INPUT = 200_000;

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function splitLines(text: string): { lines: string[]; finalNewline: boolean } {
  if (text === '') return { lines: [], finalNewline: true };
  const finalNewline = text.endsWith('\n');
  const body = finalNewline ? text.slice(0, -1) : text;
  return { lines: body.split('\n'), finalNewline };
}

function stripTimestamp(label: string): string {
  const tab = label.indexOf('\t');
  return tab === -1 ? label : label.slice(0, tab);
}

export function applyStrictUnifiedDiff(path: string, before: string, diff: string): DiffApplyResult {
  try {
    if (typeof path !== 'string' || typeof before !== 'string' || typeof diff !== 'string') {
      return { ok: false, reason: 'inputs must be strings' };
    }
    if (before.length > MAX_INPUT || diff.length > MAX_INPUT) return { ok: false, reason: 'input too large' };
    if (diff.includes('\r')) return { ok: false, reason: 'carriage returns in diff are not supported' };

    const dl = diff.split('\n');
    if (dl.length > 0 && dl[dl.length - 1] === '') dl.pop();
    let i = 0;
    while (i < dl.length && PREFACE.test(dl[i])) i++;
    if (i + 1 >= dl.length || !dl[i].startsWith('--- ') || !dl[i + 1].startsWith('+++ ')) {
      return { ok: false, reason: 'missing or unsupported file headers' };
    }
    if (stripTimestamp(dl[i].slice(4)) !== `a/${path}` || stripTimestamp(dl[i + 1].slice(4)) !== `b/${path}`) {
      return { ok: false, reason: 'file header path does not match the proposal path' };
    }
    i += 2;
    if (i >= dl.length) return { ok: false, reason: 'no hunks' };

    const src = splitLines(before);
    const out: string[] = [];
    let cursor = 0;
    let lastHunkReachedEnd = false;
    let lastNewNoNewline = false;

    while (i < dl.length) {
      const m = HUNK.exec(dl[i]);
      if (!m) return { ok: false, reason: `unexpected content where a hunk header was expected (diff line ${i + 1})` };
      i++;
      const oldStart = Number(m[1]);
      const oldCount = m[2] === undefined ? 1 : Number(m[2]);
      const newCount = m[4] === undefined ? 1 : Number(m[4]);
      if (![oldStart, oldCount, newCount].every(Number.isSafeInteger)) return { ok: false, reason: 'invalid hunk numbers' };
      if (oldCount === 0 && newCount === 0) return { ok: false, reason: 'empty hunk' };

      const startIndex = oldCount === 0 ? oldStart : oldStart - 1;
      if (startIndex < 0 || startIndex < cursor || startIndex > src.lines.length) {
        return { ok: false, reason: 'hunk position is out of order, overlapping or outside the file' };
      }
      while (cursor < startIndex) out.push(src.lines[cursor++]);

      let oldLeft = oldCount;
      let newLeft = newCount;
      let prev = '';
      let oldNoNewline = false;
      let newNoNewline = false;

      for (;;) {
        const line = i < dl.length ? dl[i] : undefined;
        if (line !== undefined && line.startsWith('\\')) {
          if (line !== NO_NEWLINE) return { ok: false, reason: 'unsupported marker line' };
          const next = i + 1 < dl.length ? dl[i + 1] : undefined;
          if (prev === ' ') {
            if (oldLeft !== 0 || newLeft !== 0) return { ok: false, reason: 'misplaced no-newline marker' };
            oldNoNewline = true; newNoNewline = true;
          } else if (prev === '-') {
            if (oldLeft !== 0) return { ok: false, reason: 'misplaced no-newline marker' };
            if (next !== undefined && !next.startsWith('+') && !HUNK.test(next) && !next.startsWith('\\')) {
              return { ok: false, reason: 'misplaced no-newline marker' };
            }
            oldNoNewline = true;
          } else if (prev === '+') {
            if (newLeft !== 0) return { ok: false, reason: 'misplaced no-newline marker' };
            newNoNewline = true;
          } else {
            return { ok: false, reason: 'no-newline marker without a preceding line' };
          }
          prev = '\\';
          i++;
          continue;
        }
        if (oldLeft === 0 && newLeft === 0) break;
        if (line === undefined) return { ok: false, reason: 'hunk is shorter than its header says' };

        const kind = line === '' ? ' ' : line[0];
        const text = line === '' ? '' : line.slice(1);
        if (kind === ' ') {
          if (oldLeft === 0 || newLeft === 0) return { ok: false, reason: 'hunk is longer than its header says' };
          if (cursor >= src.lines.length || src.lines[cursor] !== text) {
            return { ok: false, reason: `context does not match the original at line ${cursor + 1}` };
          }
          out.push(text); cursor++; oldLeft--; newLeft--;
        } else if (kind === '-') {
          if (oldLeft === 0) return { ok: false, reason: 'hunk is longer than its header says' };
          if (cursor >= src.lines.length || src.lines[cursor] !== text) {
            return { ok: false, reason: `removed line does not match the original at line ${cursor + 1}` };
          }
          cursor++; oldLeft--;
        } else if (kind === '+') {
          if (newLeft === 0) return { ok: false, reason: 'hunk is longer than its header says' };
          out.push(text); newLeft--;
        } else {
          return { ok: false, reason: `invalid hunk line prefix (diff line ${i + 1})` };
        }
        prev = kind;
        i++;
      }

      if (cursor === src.lines.length) {
        if (oldNoNewline !== !src.finalNewline) {
          return { ok: false, reason: 'end-of-file newline state does not match the original' };
        }
        lastHunkReachedEnd = true;
        lastNewNoNewline = newNoNewline;
      } else if (oldNoNewline || newNoNewline) {
        return { ok: false, reason: 'no-newline marker on a line that is not the last line of the file' };
      } else {
        lastHunkReachedEnd = false;
      }
    }

    while (cursor < src.lines.length) out.push(src.lines[cursor++]);

    const finalNewline = lastHunkReachedEnd ? !lastNewNoNewline : src.finalNewline;
    const after = out.length === 0 ? '' : out.join('\n') + (finalNewline ? '\n' : '');
    return { ok: true, after };
  } catch {
    return { ok: false, reason: 'internal error while applying the diff' };
  }
}

export interface CodeFixAfterStateEvidence {
  diff_applies_exactly_to_observed_original: boolean;
  diff_failure_reason: string | null;
  sha256_of_diff_result: string | null;
  sha256_of_content_to_be_committed: string | null;
  sealed_after_sha256: string;
  diff_result_sha256_equals_sealed_after_sha256: boolean;
  content_to_be_committed_sha256_equals_sealed_after_sha256: boolean;
  content_to_be_committed_equals_diff_result: boolean;
  diff_result_size_bytes: number | null;
}

export function computeCodeFixAfterStateEvidence(input: {
  path: string;
  observedBefore: string;
  diff: string;
  sealedAfterSha256: string;
  contentToCommit: unknown;
}): CodeFixAfterStateEvidence {
  const sealed = typeof input.sealedAfterSha256 === 'string' ? input.sealedAfterSha256 : '';
  const applied = applyStrictUnifiedDiff(input.path, input.observedBefore, input.diff);
  const resultSha = applied.ok ? sha256(applied.after) : null;
  const commitSha = typeof input.contentToCommit === 'string' ? sha256(input.contentToCommit) : null;
  return {
    diff_applies_exactly_to_observed_original: applied.ok,
    diff_failure_reason: applied.ok ? null : applied.reason,
    sha256_of_diff_result: resultSha,
    sha256_of_content_to_be_committed: commitSha,
    sealed_after_sha256: sealed,
    diff_result_sha256_equals_sealed_after_sha256: resultSha !== null && sealed !== '' && resultSha === sealed,
    content_to_be_committed_sha256_equals_sealed_after_sha256: commitSha !== null && sealed !== '' && commitSha === sealed,
    content_to_be_committed_equals_diff_result: applied.ok && typeof input.contentToCommit === 'string' && input.contentToCommit === applied.after,
    diff_result_size_bytes: applied.ok ? Buffer.byteLength(applied.after, 'utf8') : null
  };
}

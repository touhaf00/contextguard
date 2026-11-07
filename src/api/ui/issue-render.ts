import type { FailedRunFacts } from "./ci-run-evidence.js";

export const ISSUE_BODY_MAX_CHARS = 6000;
const MAX_LINES_PER_JOB = 8;
const MAX_QUOTED_LINE_CHARS = 300;
const MAX_FAILED_STEPS = 4;

export const CI_FAILURE_NEXT_STEP = "Investigate this failure, starting from the evidence above.";

export interface RenderedIssue {
  title: string;
  body: string;
}

function inline(value: string, max = 160): string {
  const cleaned = value.replace(/[`\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
  return cleaned || "unnamed";
}

function fenced(value: string): string {
  return value.replace(/\r/g, "").replace(/`{3,}/g, match => "'".repeat(match.length));
}

function readsTheSameInJson(text: string): boolean {
  return JSON.stringify(text).slice(1, -1) === text;
}

function branchLine(branch: string, sha: string): string {
  return `- Branch \`${inline(branch, 180)}\` points to commit \`${sha}\`.`;
}

function ciFailureBody(input: { repository: string; branch: string; sha: string; facts: FailedRunFacts }, maxLines: number): string {
  const { branch, sha, facts } = input;
  const lines: string[] = ["## Observed evidence", "", branchLine(branch, sha)];

  const run = facts.run;
  if (run?.conclusion) {
    const where = [
      run.head_branch ? `branch \`${inline(run.head_branch, 180)}\`` : "",
      run.head_sha ? `commit \`${inline(run.head_sha, 40)}\`` : "",
      run.event ? `event \`${inline(run.event, 40)}\`` : ""
    ].filter(Boolean);
    lines.push(
      `- Workflow run${run.workflow_name ? ` \`${inline(run.workflow_name)}\`` : ""} ${facts.runUrl} concluded \`${inline(run.conclusion, 30)}\`` +
        (where.length ? ` (${where.join(", ")}).` : ".")
    );
  } else {
    lines.push(`- Workflow run: ${facts.runUrl}`);
  }

  for (const job of facts.failedJobs) {
    const steps = job.failedSteps.slice(0, MAX_FAILED_STEPS).map(step => `\`${inline(step)}\``);
    lines.push(
      `- Job \`${inline(job.name)}\` concluded \`failure\`.` +
        (steps.length ? ` Failed step${steps.length > 1 ? "s" : ""}: ${steps.join(", ")}.` : "")
    );
  }

  if (maxLines > 0) {
    for (const job of facts.failedJobs) {
      const quoted = (job.logLines ?? [])
        .filter(line => line.text.trim() !== "" && line.text.length <= MAX_QUOTED_LINE_CHARS && readsTheSameInJson(line.text))
        .slice(-maxLines);
      if (!quoted.length) continue;
      lines.push(
        "",
        `The log of job \`${inline(job.name)}\` contains these lines (line number: text):`,
        "",
        "```text",
        ...quoted.map(line => `${line.number}: ${fenced(line.text)}`),
        "```"
      );
    }
  }

  lines.push("", "## Next step", "", CI_FAILURE_NEXT_STEP);
  return lines.join("\n");
}

export function renderCiFailureIssue(input: {
  repository: string;
  branch: string;
  sha: string;
  facts: FailedRunFacts;
}): RenderedIssue {
  const first = input.facts.failedJobs[0];
  const step = first?.failedSteps[0];
  const title = (
    `CI failure in run ${input.facts.runId}` +
    (first ? `: job "${inline(first.name, 70)}"` : "") +
    (step ? `, step "${inline(step, 70)}"` : "")
  ).slice(0, 180);
  for (let maxLines = MAX_LINES_PER_JOB; maxLines > 0; maxLines--) {
    const body = ciFailureBody(input, maxLines);
    if (body.length <= ISSUE_BODY_MAX_CHARS) return { title, body };
  }
  return { title, body: ciFailureBody(input, 0) };
}

export function describeServerWrittenBody(body: string): {
  bullets: string[];
  quoted: Array<{ job: string; count: number; lines: number[] }>;
} {
  const bullets: string[] = [];
  const quoted: Array<{ job: string; count: number; lines: number[] }> = [];
  let job = "";
  let inFence = false;
  for (const line of body.split("\n")) {
    if (inFence) {
      if (line === "```") inFence = false;
      else {
        const block = quoted[quoted.length - 1];
        block.count++;
        const number = /^(\d+): /.exec(line);
        if (number) block.lines.push(Number(number[1]));
      }
      continue;
    }
    const heading = /^The log of job `(.*)` contains these lines/.exec(line);
    if (heading) {
      job = heading[1];
      continue;
    }
    if (line === "```text") {
      inFence = true;
      quoted.push({ job, count: 0, lines: [] });
      continue;
    }
    if (line.startsWith("- ")) bullets.push(line.slice(2));
  }
  return { bullets, quoted: quoted.filter(block => block.count > 0) };
}

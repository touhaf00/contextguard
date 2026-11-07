import assert from "node:assert/strict";
import test from "node:test";
import { GitHubAgentIssueDiscovery, GitHubAgentDraftError } from "../dist/api/ui/agent-issue-draft.js";
import { readIssueEvidenceVariants } from "../dist/api/ui/cominty-pipeline.js";
import { renderCiFailureIssue, ISSUE_BODY_MAX_CHARS } from "../dist/api/ui/issue-render.js";

const repo = "touhaf00/contextguard-video-demo";
const sha = "09ed8547d7268574807b7851a43345036a1504f6";
const runId = 42324161481;
const runUrl = `https://github.com/${repo}/actions/runs/${runId}`;
const commitUrl = `https://github.com/${repo}/commit/${sha}`;
const T = "2026-11-07T01:00:00.4000000Z ";
const LOG = [
  `${T}##[group]Run python -m unittest -v`,
  `${T}test_add (tests.test_calculator.CalculatorTests.test_add) ... ok`,
  `${T}test_average (tests.test_calculator.CalculatorTests.test_average) ... FAIL`,
  `${T}`,
  `${T}======================================================================`,
  `${T}FAIL: test_average (tests.test_calculator.CalculatorTests.test_average)`,
  `${T}----------------------------------------------------------------------`,
  `${T}Traceback (most recent call last):`,
  `${T}  File "/home/runner/work/demo/demo/tests/test_calculator.py", line 24, in test_average`,
  `${T}    self.assertEqual(average([2, 4, 6]), 4)`,
  `${T}AssertionError: 3.0 != 4`,
  `${T}`,
  `${T}Ran 6 tests in 0.001s`,
  `${T}`,
  `${T}FAILED (failures=1)`,
  `${T}##[error]Process completed with exit code 1.`
].join("\n");

function github({ conclusion = "failure", failLog = false } = {}) {
  const calls = { run: 0, jobs: 0, logs: 0 };
  return {
    calls,
    async getRef() { return { object: { type: "commit", sha } }; },
    async getBranch() { return { name: "main", commit: { sha } }; },
    async getCommit() { return { sha, commit: { message: "Add tiny calculator library and CI" } }; },
    async getWorkflowRuns() { return { workflow_runs: [{ id: runId, name: "CI", conclusion, html_url: runUrl }] }; },
    async getWorkflowRun(r, id) {
      calls.run++;
      return { id, name: "CI", event: "push", status: "completed", conclusion, head_branch: "main", head_sha: sha, run_attempt: 1, html_url: runUrl };
    },
    async getWorkflowRunJobs(r, id) {
      calls.jobs++;
      return { jobs: [{ id: 777, run_id: id, name: "tests", conclusion,
        steps: [{ name: "Set up job", conclusion: "success" }, { name: "Run unit tests", conclusion }] }] };
    },
    async getWorkflowJobLog() {
      calls.logs++;
      if (failLog) throw new Error("403");
      return { text: LOG, truncated: false };
    }
  };
}

const MODEL_REPLY = JSON.stringify({
  action: "create_issue",
  title: "Fix average() divisor so CI test_average passes",
  body: `## Observed\nRun ${runUrl} on ${commitUrl} failed because average() divides by the wrong length.\n\n## Fix\nDivide by the length of the list.`,
  rationale: "The failed run shows test_average failing with AssertionError: 3.0 != 4 on the current commit.",
  confidence: 0.9,
  evidence_urls: [commitUrl, runUrl]
});
const TASK_REPLY = JSON.stringify({
  action: "create_issue",
  title: "Add a CI failure triage checklist",
  body: `## Observed\nThe CI is unreliable and nobody looks at it. ${commitUrl}`,
  rationale: "A short checklist makes future failures faster to investigate.",
  confidence: 0.7,
  evidence_urls: [commitUrl]
});
const OBJECTIVE = { repository: repo, branch: "main", objective: "Investigate recent CI results and propose one actionable issue." };
const agent = (reply, prompts = []) => ({ async run(prompt) { prompts.push(prompt); return reply; } });

test("A failed run becomes a server-written issue: nothing of the model's text, every fact a server read", async () => {
  const reader = github();
  const draft = await new GitHubAgentIssueDiscovery(reader, agent(MODEL_REPLY)).generate(OBJECTIVE);
  const { title, body } = draft.issue;
  assert.equal(title, `CI failure in run ${runId}: job "tests", step "Run unit tests"`);
  assert.match(body, /^## Observed evidence\n/);
  assert.ok(body.includes(`- Branch \`main\` points to commit \`${sha}\`.`));
  assert.ok(!body.includes(commitUrl));
  assert.ok(body.includes(`- Workflow run \`CI\` ${runUrl} concluded \`failure\` (branch \`main\`, commit \`${sha}\`, event \`push\`).`));
  assert.ok(body.includes("- Job `tests` concluded `failure`. Failed step: `Run unit tests`."));
  assert.ok(body.includes("11: AssertionError: 3.0 != 4"));
  assert.ok(body.includes("15: FAILED (failures=1)"));
  assert.ok(body.includes("16: ##[error]Process completed with exit code 1."));
  assert.match(body, /## Next step\n\nInvestigate this failure, starting from the evidence above\.$/);
  assert.doesNotMatch(`${title}\n${body}`, /divisor|divides|wrong length|Fix|because/);
  assert.doesNotMatch(body, /^\d+: $/m);
  assert.deepEqual(draft.evidence_urls, [commitUrl, runUrl]);
  assert.equal(draft.rationale, JSON.parse(MODEL_REPLY).rationale);
  assert.equal(draft.external_action_executed, false);
  assert.deepEqual(reader.calls, { run: 1, jobs: 1, logs: 1 });
});

test("Every fact and log line the issue states is one the Worker and the Guard read for themselves", async () => {
  const draft = await new GitHubAgentIssueDiscovery(github(), agent(MODEL_REPLY)).generate(OBJECTIVE);
  const quoted = draft.issue.body.split("```text\n")[1].split("\n```")[0].split("\n");
  assert.ok(quoted.length >= 5, "the assertion, the summary and the error line are quoted");
  const request = {
    subject: { provider: "github", resource_type: "repository_ref", resource_id: repo },
    proposed_action: { namespace: "github", action: "create_issue", parameters: draft.issue }
  };
  const { full, brief } = await readIssueEvidenceVariants(request, github());
  for (const line of quoted) {
    const [, number, text] = /^(\d+): (.*)$/.exec(line);
    assert.ok(brief.includes(JSON.stringify(`${number}: ${text}`)), `the compact evidence has line ${number}: ${text}`);
    assert.ok(full.includes(JSON.stringify(text).slice(1, -1)), `the full evidence has: ${text}`);
  }
  assert.ok(full.includes(`"head_sha":"${sha}"`));
  assert.ok(full.includes('"conclusion":"failure"'));
  assert.ok(full.includes('{"name":"Run unit tests","conclusion":"failure"}'));
});

test("Without a failed run nothing is proposed: no unverifiable premise, no Cominty call", async () => {
  const reader = github({ conclusion: "success" });
  const prompts = [];
  await assert.rejects(
    new GitHubAgentIssueDiscovery(reader, agent(TASK_REPLY, prompts)).generate(OBJECTIVE),
    error => error instanceof GitHubAgentDraftError && error.code === "NO_CI_FAILURE" &&
      /nothing was proposed and nothing was written/.test(error.message)
  );
  assert.equal(prompts.length, 0);
  assert.deepEqual(reader.calls, { run: 0, jobs: 0, logs: 0 });
});

test("Only log lines that read the same in JSON are quoted: no double quote, no backslash", async () => {
  const draft = await new GitHubAgentIssueDiscovery(github(), agent(MODEL_REPLY)).generate(OBJECTIVE);
  const quoted = draft.issue.body.split("```text\n")[1].split("\n```")[0].split("\n");
  assert.ok(!quoted.some(line => line.startsWith("9: ")), "the Traceback File line has double quotes");
  assert.ok(quoted.includes("11: AssertionError: 3.0 != 4"));
  for (const line of quoted) {
    assert.doesNotMatch(line, /["\\]/);
    assert.equal(JSON.stringify(line).slice(1, -1), line, "identical inside a JSON string");
  }
  const facts = { runId, runUrl, run: null, failedJobs: [{ name: "tests", failedSteps: ["Run"], logLines: [
    { number: 1, text: 'raise ValueError("bad")' },
    { number: 2, text: "C:\\work\\test.py failed" },
    { number: 3, text: "AssertionError: 3.0 != 4" }
  ] }] };
  const { body } = renderCiFailureIssue({ repository: repo, branch: "main", sha, facts });
  assert.ok(body.includes("3: AssertionError: 3.0 != 4"));
  assert.doesNotMatch(body, /ValueError|C:/);
});

test("The issue stays within the body limit and log text can never leave its code block", () => {
  const logLines = Array.from({ length: 40 }, (_, i) => ({
    number: i + 1,
    text: `AssertionError: case ${i} \`\`\` @maintainer ` + "x".repeat(260)
  }));
  const jobs = ["unit `tests`\ninjected", "lint", "docker", "deploy"].map(name => ({ name, failedSteps: ["Run", "Lint"], logLines }));
  const { title, body } = renderCiFailureIssue({ repository: repo, branch: "main", sha, facts: { runId, runUrl, run: null, failedJobs: jobs } });
  assert.ok(body.length <= ISSUE_BODY_MAX_CHARS, `${body.length} characters`);
  const opened = body.split("\n").filter(line => line === "```text").length;
  const closed = body.split("\n").filter(line => line === "```").length;
  assert.ok(opened > 0 && opened === closed, "every quoted block is opened and closed exactly once");
  const outside = body.replace(/```text\n[\s\S]*?\n```/g, "");
  assert.doesNotMatch(outside, /@maintainer|AssertionError/, "log text only appears inside the code blocks");
  assert.doesNotMatch(body.replace(/^```(text)?$/gm, ""), /```/, "no fence inside a quoted line");
  assert.ok(body.includes(`- Workflow run: ${runUrl}`), "an unread run record states only the link");
  assert.ok(body.includes("- Job `unit tests injected` concluded `failure`."), "a name cannot break out of its backticks");
  assert.doesNotMatch(title, /[`\n]/);
  assert.ok(title.length <= 180);
});

test("An unreadable log adds no quoted line and no sentence about the log", async () => {
  const draft = await new GitHubAgentIssueDiscovery(github({ failLog: true }), agent(MODEL_REPLY)).generate(OBJECTIVE);
  assert.doesNotMatch(draft.issue.body, /```|contains these lines|AssertionError/);
  assert.ok(draft.issue.body.includes("- Job `tests` concluded `failure`. Failed step: `Run unit tests`."));
});

test("When the server writes the issue, the agent's decision is enough, and anything else is still refused", async () => {
  const decisionOnly = JSON.stringify({ action: "create_issue", rationale: "The latest run on main failed in the unit test step.", confidence: 0.8 });
  const draft = await new GitHubAgentIssueDiscovery(github(), agent(decisionOnly)).generate(OBJECTIVE);
  assert.match(draft.issue.title, /^CI failure in run /);
  for (const reply of [
    { action: "close_issue", rationale: "x".repeat(40), confidence: 0.5 },
    { action: "create_issue", rationale: "x".repeat(40), confidence: 0.5, labels: ["bug"] },
    { action: "create_issue", rationale: "too short", confidence: 0.5 },
    { action: "create_issue", rationale: "x".repeat(40), confidence: 3 }
  ]) {
    await assert.rejects(
      new GitHubAgentIssueDiscovery(github(), agent(JSON.stringify(reply))).generate(OBJECTIVE),
      error => error instanceof GitHubAgentDraftError && error.code === "INVALID_AGENT_OUTPUT",
      JSON.stringify(reply)
    );
  }
  await assert.rejects(new GitHubAgentIssueDiscovery(github({ conclusion: "success" }), agent(decisionOnly)).generate(OBJECTIVE));
});

function verificationRequest(issue, branch = "main") {
  const subject = { provider: "github", resource_type: "repository_ref", resource_id: repo, selector: { kind: "branch", ref: branch } };
  return {
    subject,
    snapshot: { snapshot_id: "github:test", subject, version: sha, observed_at: new Date().toISOString() },
    proposed_action: { namespace: "github", action: "create_issue", parameters: issue }
  };
}

test("Regenerated from fresh reads, the server-written issue is confirmed to the Worker and the Guard, statement by statement", async () => {
  const draft = await new GitHubAgentIssueDiscovery(github(), agent(MODEL_REPLY)).generate(OBJECTIVE);
  const { full, brief } = await readIssueEvidenceVariants(verificationRequest(draft.issue), github());
  for (const text of [full, brief]) {
    assert.ok(text.startsWith("\nAPPLICATION-VERIFIED CHECK OF THE PROPOSED ISSUE"), "the check comes first, so a shortened block keeps it");
    assert.match(text, /regenerated now, they match character for character/);
    assert.ok(text.includes(`S1: Branch \`main\` points to commit \`${sha}\`.`));
    assert.ok(text.includes(`S2: Workflow run \`CI\` ${runUrl} concluded \`failure\``));
    assert.ok(text.includes("S3: Job `tests` concluded `failure`. Failed step: `Run unit tests`."));
    assert.match(text, /S4 to S11: the 8 lines quoted from the log of job `tests` \(log lines 3, 6, 8, 10, 11, 13, 15, 16\); each is exactly the line with the same number/);
    assert.match(text, /the body states no cause, reproduction, fix or\nexpected behaviour: there is no claim of that kind to list or to check/);
    assert.match(text, /A statement you find in the fresh reads below is verified by them: no further comparison is pending\./);
    assert.match(text, /Make one REQUIRED claim per statement S1 to S11, plus the open-issue title check, and no other claim\./);
    assert.match(text, /Immediately before the write, ContextGuard reads the branch and the open issues again and refuses the write/);
    assert.match(text, /The run link only identifies the run read below; it is not a statement\./);
    assert.match(text, /READY means every REQUIRED claim is SUPPORTED\./);
    assert.match(text, /CITED BY THE PROPOSED NEW ISSUE/);
    assert.ok(text.includes("AssertionError: 3.0 != 4"));
  }
});

test("Any difference from the server-written text, another branch or a changed run removes the confirmation", async () => {
  const draft = await new GitHubAgentIssueDiscovery(github(), agent(MODEL_REPLY)).generate(OBJECTIVE);
  const cases = [
    [{ ...draft.issue, body: draft.issue.body.replace("AssertionError: 3.0 != 4", "AssertionError: 3.0 != 5") }, "main", github()],
    [{ ...draft.issue, title: `${draft.issue.title} (urgent)` }, "main", github()],
    [draft.issue, "release", github()],
    [draft.issue, "main", github({ conclusion: "cancelled" })],
    [draft.issue, "main", github({ failLog: true })]
  ];
  for (const [issue, branch, client] of cases) {
    const { full, brief } = await readIssueEvidenceVariants(verificationRequest(issue, branch), client);
    assert.doesNotMatch(full + brief, /APPLICATION-VERIFIED CHECK OF THE PROPOSED ISSUE/);
    assert.match(full, /CITED BY THE PROPOSED NEW ISSUE/, "the run is still read and verified as before");
  }
});

test("The agent is told who writes the issue", async () => {
  const failed = [];
  await new GitHubAgentIssueDiscovery(github(), agent(MODEL_REPLY, failed)).generate(OBJECTIVE);
  assert.match(failed[0], /server writes the issue title and body itself/);
  assert.match(failed[0], /never written to GitHub/);
});

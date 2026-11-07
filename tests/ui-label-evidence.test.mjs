import assert from "node:assert/strict";
import test from "node:test";
import { normalizeIssue, fingerprintIssue } from "../dist/adapters/github/issue-maintenance.js";
import { readIssueEvidence } from "../dist/api/ui/cominty-pipeline.js";

const repo = "touhaf00/contextguard-demo";
const run = 42036585403;
const runUrl = `https://github.com/${repo}/actions/runs/${run}`;
const baseIssue = { number: 1, title: "Investigate Docker Hub", state: "open", updated_at: "2026-11-05T16:18:42Z", labels: [], comments: 0, html_url: `https://github.com/${repo}/issues/1` };
const withBody = body => ({ ...baseIssue, body });
const fingerprint = issue => fingerprintIssue(normalizeIssue(issue, repo));

function request(action, issue, params = {}) {
  return { subject: { resource_id: repo }, proposed_action: { action, parameters: { issue_number: 1, issue_fingerprint: fingerprint(issue), ...params } } };
}
function stub(issue, { failJobs = false } = {}) {
  const calls = { issue: 0, jobs: [], logs: [] };
  return { calls,
    async getIssue() { calls.issue++; return issue; },
    async getWorkflowRunJobs(r, id) { calls.jobs.push(id); if (failJobs) throw new Error("403"); return { jobs: [{ id: 777, run_id: id, name: "docker", conclusion: "failure", steps: [{ name: "Connexion à Docker Hub", conclusion: "failure" }] }] }; },
    async getWorkflowJobLog(r, id) { calls.logs.push(id); return { text: "2026-11-05T16:18:01Z ##[error]Username and password required", truncated: false }; } };
}

const NO_TEXT = [["add_labels", { labels: ["ci-cd", "needs-triage"] }], ["close_issue", {}], ["reopen_issue", {}]];

test("Actions without text read the run the issue cites, so reported CI facts can be checked", async () => {
  for (const [action, params] of NO_TEXT) {
    const issue = withBody(`Job docker failed. ${runUrl}`);
    const client = stub(issue);
    const text = await readIssueEvidence(request(action, issue, params), client);
    assert.deepEqual(client.calls.jobs, [run], action);
    assert.deepEqual(client.calls.logs, [777], action);
    assert.match(text, /GITHUB ACTIONS JOB AND STEP OUTCOMES/, action);
    assert.match(text, /JOB LOG EXCERPT \(UNTRUSTED WORKFLOW OUTPUT/, action);
    assert.match(text, /##\[error\]Username and password required/, action);
    assert.match(text, /does NOT establish why the step failed/, action);
  }
});

test("Nothing is read when the issue cites no run, or only a run from another repository", async () => {
  for (const body of ["No CI link here.", `Other repo: https://github.com/someone/else/actions/runs/${run}`]) {
    for (const [action, params] of NO_TEXT) {
      const issue = withBody(body);
      const client = stub(issue);
      const text = await readIssueEvidence(request(action, issue, params), client);
      assert.deepEqual(client.calls.jobs, [], `${action}: ${body}`);
      assert.deepEqual(client.calls.logs, []);
      assert.doesNotMatch(text, /GITHUB ACTIONS JOB/);
    }
  }
});

test("Text-carrying actions keep the stricter rule: the proposed text must cite the same run", async () => {
  const issue = withBody(`Job docker failed. ${runUrl}`);
  for (const [action, params] of [["comment_issue", { body: "The issue reports a login failure." }], ["edit_issue", { title: "Better title", body: "Rewritten with no link." }]]) {
    const client = stub(issue);
    await readIssueEvidence(request(action, issue, params), client);
    assert.deepEqual(client.calls.jobs, [], action);
  }
  for (const [action, params] of [["comment_issue", { body: `Reported failure. ${runUrl}` }], ["edit_issue", { title: "t", body: `Rewritten. ${runUrl}` }]]) {
    const client = stub(issue);
    await readIssueEvidence(request(action, issue, params), client);
    assert.deepEqual(client.calls.jobs, [run], action);
  }
});

test("The number of runs read stays bounded at two", async () => {
  const issue = withBody([1, 2, 3, 4].map(n => `https://github.com/${repo}/actions/runs/${n}`).join(" "));
  const client = stub(issue);
  await readIssueEvidence(request("add_labels", issue, { labels: ["ci-cd"] }), client);
  assert.deepEqual(client.calls.jobs, [1, 2]);
});

test("Issue drift still blocks before any Actions read, and unreadable runs are never presented as verified", async () => {
  const issue = withBody(`Failure. ${runUrl}`);
  const drifted = { ...issue, updated_at: "2026-11-05T16:18:43Z" };
  const client = stub(drifted);
  await assert.rejects(readIssueEvidence(request("add_labels", issue, { labels: ["ci-cd"] }), client), /GITHUB_ISSUE_CHANGED/);
  assert.deepEqual(client.calls.jobs, []);

  const failing = stub(issue, { failJobs: true });
  const text = await readIssueEvidence(request("add_labels", issue, { labels: ["ci-cd"] }), failing);
  assert.match(text, /JOB OBSERVATION UNAVAILABLE for run 42036585403/);
  assert.doesNotMatch(text, /JOB AND STEP OUTCOMES|JOB LOG EXCERPT/);
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

const repo = "acme/large-project";
const sha = "a".repeat(40);
const runId = 4242;
const runUrl = `https://github.com/${repo}/actions/runs/${runId}`;
const commitUrl = `https://github.com/${repo}/commit/${sha}`;
const LIMIT = 30000;

function fileAt(path) {
  const text = Array.from({ length: 330 }, (_, i) => `# ${path} line ${i}: some ordinary source code here`).join("\n").slice(0, 11900);
  const bytes = Buffer.from(text, "utf8");
  const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  return { type: "file", path, encoding: "base64", content: bytes.toString("base64"), sha: blob, size: bytes.length };
}

async function runScenario(claimCount) {
  process.env.COMINTY_API_KEY ??= "test-key";
  process.env.COMINTY_USER_ID ??= "user_2aBcDeFgHiJkLmNoPqRsTuVwXyZ";
  process.env.COMINTY_WORKER_AGENT_ID ??= "worker-agent";
  process.env.COMINTY_GUARD_AGENT_ID ??= "guard-agent";
  const { getComintyRuntime } = await import("../dist/cominty.js");
  const { ComintyGenericAgentPipelineV2 } = await import("../dist/api/ui/cominty-pipeline.js");
  const { GitHubUiFlowV2 } = await import("../dist/api/ui/github-flow.js");
  const { GenericAuthorizationServiceV2 } = await import("../dist/api/v2/service.js");
  const { TrustedExecutionContextStoreV2 } = await import("../dist/api/v2/execution-context-store.js");

  const log = Array.from({ length: 40 }, (_, i) => `test_case_${i} (suite.Tests.test_case_${i}) ... ok`)
    .concat(["test_big (suite.Tests.test_big) ... FAIL", "FAIL: test_big (suite.Tests.test_big)", "Traceback (most recent call last):",
      '  File "/work/tests/test_big.py", line 9, in test_big', "    self.assertEqual(big(), 1)", "AssertionError: 2 != 1",
      "Ran 41 tests in 0.2s", "FAILED (failures=1)", "##[error]Process completed with exit code 1."]).join("\n");
  const github = {
    async getRef() { return { object: { type: "commit", sha } }; },
    async getBranch() { return { name: "main", commit: { sha } }; },
    async getCommit() { return { sha, commit: { message: "Big commit" }, files: [] }; },
    async getOpenIssues() { return []; },
    async getFileAtCommit(_r, path) { return fileAt(path); },
    async getWorkflowRun(_r, id) { return { id, name: "CI", event: "push", status: "completed", conclusion: "failure", head_branch: "main", head_sha: sha, html_url: runUrl }; },
    async getWorkflowRunJobs(_r, id) {
      return { jobs: Array.from({ length: 6 }, (_, j) => ({ id: 100 + j, run_id: id, name: `job-${j}`, conclusion: j === 0 ? "failure" : "success",
        steps: Array.from({ length: 12 }, (_, k) => ({ name: `Step number ${k} of job ${j}`, conclusion: j === 0 && k === 11 ? "failure" : "success" })) })) };
    },
    async getWorkflowJobLog() { return { text: log, truncated: false }; }
  };

  const title = "Investigate the failing big test in the CI run on main";
  const body = `CI run ${runUrl} on ${commitUrl} failed. Related files: \`src/a.py\`, \`src/b.py\`, \`src/c.py\`, \`src/d.py\`.`;
  const draftId = "01234567-89ab-4def-8012-3456789abcde";

  let captured;
  const sent = [];
  const { client } = getComintyRuntime();
  client.chat = {
    async start({ agentId, message }) {
      sent.push({ agentId, message });
      const isWorker = agentId === process.env.COMINTY_WORKER_AGENT_ID;
      const n = claimCount;
      const reply = isWorker
        ? JSON.stringify({
            assembled_at: new Date().toISOString(), assessed_at: new Date().toISOString(),
            evidence: Array.from({ length: n }, (_, i) => ({ evidence_id: `E${i + 1}`, source_snapshot: captured.snapshot,
              locator: i % 2 ? commitUrl : runUrl, level: "OUTPUT_OBSERVED",
              observation: `Server-read observation ${i + 1}: ` + "the run concluded with failure on branch main at the locked commit. ".repeat(9) })),
            claims: Array.from({ length: n }, (_, i) => ({ claim_id: `C${i + 1}`, criticality: "REQUIRED", status: "SUPPORTED",
              evidence_refs: [`E${i + 1}`], statement: `Claim ${i + 1}: ` + "the CI run failed at the last step of the first job. ".repeat(4) })),
            decision: "READY", confidence: 0.8, summary: "Everything observed is consistent."
          })
        : "the Guard is stopped here, this is not JSON";
      return { async text() { return reply; } };
    }
  };

  const real = new ComintyGenericAgentPipelineV2(github);
  const flow = new GitHubUiFlowV2({
    authorizationService: new GenericAuthorizationServiceV2(),
    executionContextStore: new TrustedExecutionContextStoreV2(),
    snapshotResolver: {
      resolver_version: "2", resolver_id: "github.budget-test", provider: "github", supports: () => true,
      async resolve(subject) { return { snapshot_id: "github:budget", subject, version: sha, observed_at: new Date().toISOString() }; }
    },
    getAgentDraft: key => key === draftId
      ? { repository: repo, branch: "main", investigated_sha: sha, issue: { title, body } } : undefined,
    agentPipeline: { runtimeIdentity: () => real.runtimeIdentity(), async run(request) { captured = request; return real.run(request); } }
  });

  return { flow, sent, input: { repository: repo, target: { kind: "branch", ref: "main" }, issue: { title, body }, draft_id: draftId } };
}

test("Large cited files and a talkative Worker still produce messages under the Cominty limit", async () => {
  const { flow, sent, input } = await runScenario(12);
  await assert.rejects(flow.start(input), /GUARD_OUTPUT_INVALID/);

  assert.ok(sent.length >= 3, "Worker, then Guard and its single format repair");
  for (const message of sent) assert.ok(message.message.length < LIMIT, `${message.agentId} message of ${message.message.length} characters`);

  const worker = sent.find(m => m.agentId === process.env.COMINTY_WORKER_AGENT_ID).message;
  const guard = sent.filter(m => m.agentId === process.env.COMINTY_GUARD_AGENT_ID);
  assert.ok(guard.length >= 2);
  const first = guard[0].message;

  assert.match(worker, /ContextGuard shortened this evidence block/);
  assert.match(first, /ContextGuard shortened this evidence block/);

  assert.match(first, /VERDICT RULES:/);
  assert.match(first, /CLAIM CLASSIFICATION:/);
  assert.match(first, /NEW-ISSUE ACTION: CI CLAIM CHECK/);
  const checklist = JSON.stringify(Array.from({ length: 12 }, (_, i) => `C${i + 1}`));
  assert.ok(first.includes(checklist), "the full claim checklist is present");
  assert.match(first, /AUTHORIZATION REQUEST:/);
  assert.ok(first.includes(repo));

  assert.ok(guard[1].message.startsWith(first));
  assert.ok(guard[1].message.length - first.length < 1000);

});

test("A Worker answer too large for any Guard message stops cleanly, before the Guard is called", async () => {
  const { flow, sent, input } = await runScenario(80);
  await assert.rejects(flow.start(input), error => {
    assert.match(error.message, /PROMPT_TOO_LARGE/);
    return true;
  });
  assert.equal(sent.filter(m => m.agentId === process.env.COMINTY_GUARD_AGENT_ID).length, 0, "no oversized message was sent");
  const { PromptTooLargeError } = await import("../dist/api/ui/prompt-budget.js");
  const { pipelineHttpError } = await import("../dist/api/ui/pipeline-errors.js");
  const mapped = pipelineHttpError(new PromptTooLargeError(40000, 27500));
  assert.equal(mapped.status, 422);
});

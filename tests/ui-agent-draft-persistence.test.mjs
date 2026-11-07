import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { AgentIssueDraftStore } from "../dist/api/ui/agent-issue-store.js";
import { GitHubUiFlowV2, GitHubUiFlowErrorV2 } from "../dist/api/ui/github-flow.js";
import { parseAgentDraftStoreConfig } from "../dist/config.js";
import { buildStartupSummary } from "../dist/api/ui/startup-summary.js";

const REPO = "touhaf00/tp-cicd";
const BRANCH = "main";
const SHA = "a".repeat(40);
const TITLE = "Clarify the CI deploy job";
const BODY = "## Observed context\nThe deploy job only echoes a success message.\n\n## Acceptance criteria\n- Clarified.";
const MINUTE = 60 * 1000;

function draft(id, overrides = {}) {
  return {
    draft_id: id,
    provider: "github",
    created_by: "COMINTY_MANAGED_AGENT",
    repository: REPO,
    branch: BRANCH,
    investigated_sha: SHA,
    objective: "Investigate CI.",
    issue: { title: TITLE, body: BODY },
    rationale: "Because the deploy job does not deploy anything at all.",
    confidence: 0.8,
    evidence_urls: [],
    evidence_summary: { commit_message: "m", workflow_runs: [] },
    status: "PROPOSED_REQUIRES_VERIFICATION_AND_APPROVAL",
    external_action_executed: false,
    ...overrides
  };
}

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "cg-drafts-"));
  return { dir, file: join(dir, "nested", "agent-drafts.json"), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test("Drafts survive a server restart and stay detached copies", () => {
  const box = sandbox();
  try {
    let clock = 1_000_000;
    const first = new AgentIssueDraftStore(10, 60 * MINUTE, { filePath: box.file, now: () => clock });
    first.put(draft("d1"));

    clock += 5 * MINUTE;
    const second = new AgentIssueDraftStore(10, 60 * MINUTE, { filePath: box.file, now: () => clock });
    const restored = second.get("d1");
    assert.equal(restored.issue.title, TITLE);
    restored.issue.title = "tamper";
    assert.equal(second.get("d1").issue.title, TITLE);
    assert.equal(second.lookup("d1").status, "found");
  } finally { box.cleanup(); }
});

test("The draft file is private (0600) and holds no more than the draft", () => {
  const box = sandbox();
  try {
    new AgentIssueDraftStore(10, MINUTE, { filePath: box.file }).put(draft("d1"));
    if (process.platform !== "win32") {
      assert.equal(statSync(box.file).mode & 0o777, 0o600);
    }
    const saved = JSON.parse(readFileSync(box.file, "utf8"));
    assert.equal(saved.version, 1);
    assert.deepEqual(Object.keys(saved.items[0]).sort(), ["digest", "draft", "expiresAt"]);
  } finally { box.cleanup(); }
});

test("Expiry is reported as expired, never-seen ids as unknown", () => {
  const box = sandbox();
  try {
    let clock = 1_000_000;
    const store = new AgentIssueDraftStore(10, 15 * MINUTE, { filePath: box.file, now: () => clock });
    store.put(draft("d1"));
    assert.equal(store.lookup("d1").status, "found");
    clock += 15 * MINUTE;
    assert.equal(store.lookup("d1").status, "expired");
    assert.equal(store.get("d1"), undefined);
    assert.equal(store.lookup("never-existed").status, "unknown");

    store.put(draft("d2"));
    clock += 16 * MINUTE;
    const reloaded = new AgentIssueDraftStore(10, 15 * MINUTE, { filePath: box.file, now: () => clock });
    assert.equal(reloaded.lookup("d2").status, "expired");
  } finally { box.cleanup(); }
});

test("A corrupted, edited or foreign draft file is never trusted", () => {
  const box = sandbox();
  try {
    const clock = 1_000_000;
    const writer = new AgentIssueDraftStore(10, 60 * MINUTE, { filePath: box.file, now: () => clock });
    writer.put(draft("good"));
    writer.put(draft("edited"));
    writer.put(draft("late"));

    const saved = JSON.parse(readFileSync(box.file, "utf8"));
    saved.items.find(i => i.draft.draft_id === "edited").draft.issue.title = "Injected title";
    saved.items.find(i => i.draft.draft_id === "late").expiresAt += 10 * 24 * 60 * MINUTE;
    writeFileSync(box.file, JSON.stringify(saved));

    const reader = new AgentIssueDraftStore(10, 60 * MINUTE, { filePath: box.file, now: () => clock });
    assert.equal(reader.lookup("good").status, "found");
    assert.equal(reader.lookup("edited").status, "unknown");
    assert.equal(reader.lookup("late").status, "unknown");

    for (const content of ["not json {", "[]", "null", JSON.stringify({ version: 99, items: [] }), JSON.stringify({ version: 1, items: "x" })]) {
      writeFileSync(box.file, content);
      const empty = new AgentIssueDraftStore(10, MINUTE, { filePath: box.file });
      assert.equal(empty.lookup("good").status, "unknown");
    }
  } finally { box.cleanup(); }
});

test("The store stays bounded and evicts the oldest draft", () => {
  const store = new AgentIssueDraftStore(2, 60 * MINUTE);
  store.put(draft("a"));
  store.put(draft("b"));
  store.put(draft("c"));
  assert.equal(store.get("a"), undefined);
  assert.equal(store.get("b").draft_id, "b");
  assert.equal(store.get("c").draft_id, "c");
});

test("Memory-only mode writes nothing; a disk failure never breaks the flow", () => {
  const box = sandbox();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = message => warnings.push(String(message));
  try {
    new AgentIssueDraftStore(10, MINUTE).put(draft("m"));

    const blocker = join(box.dir, "blocker");
    writeFileSync(blocker, "x");
    const store = new AgentIssueDraftStore(10, MINUTE, { filePath: join(blocker, "drafts.json") });
    store.put(draft("x"));
    store.put(draft("y"));
    assert.equal(store.get("x").draft_id, "x");
    assert.equal(warnings.length, 1);
    assert.ok(!/ghp_|github_pat_|sk-/.test(warnings[0]));
  } finally {
    console.warn = originalWarn;
    box.cleanup();
  }
});

test("Draft lifetime and file are configurable, clamped, and fall back safely", () => {
  assert.deepEqual(parseAgentDraftStoreConfig({}), { ttlMinutes: 60, filePath: ".contextguard-data/agent-drafts.json" });
  assert.equal(parseAgentDraftStoreConfig({ CONTEXTGUARD_AGENT_DRAFT_TTL_MINUTES: "30" }).ttlMinutes, 30);
  assert.equal(parseAgentDraftStoreConfig({ CONTEXTGUARD_AGENT_DRAFT_TTL_MINUTES: "1" }).ttlMinutes, 5);
  assert.equal(parseAgentDraftStoreConfig({ CONTEXTGUARD_AGENT_DRAFT_TTL_MINUTES: "9999" }).ttlMinutes, 240);
  for (const bad of ["abc", "-5", "1.5", "", "60; rm -rf /", "99999"]) {
    assert.equal(parseAgentDraftStoreConfig({ CONTEXTGUARD_AGENT_DRAFT_TTL_MINUTES: bad }).ttlMinutes, 60, bad);
  }
  assert.equal(parseAgentDraftStoreConfig({ CONTEXTGUARD_AGENT_DRAFT_FILE: "memory" }).filePath, undefined);
  assert.equal(parseAgentDraftStoreConfig({ CONTEXTGUARD_AGENT_DRAFT_FILE: "MEMORY" }).filePath, undefined);
  assert.equal(parseAgentDraftStoreConfig({ CONTEXTGUARD_AGENT_DRAFT_FILE: "/tmp/x.json" }).filePath, "/tmp/x.json");
});

test("Startup summary states the write switch and never prints a secret", () => {
  const off = buildStartupSummary({ realExecutionEnabled: false, allowedRepositories: REPO, draftTtlMinutes: 60, draftFilePath: undefined });
  assert.match(off.join("\n"), /GitHub writes\s+: DISABLED/);
  assert.match(off.join("\n"), /memory only/);
  assert.doesNotMatch(off.join("\n"), /ENABLED -/);

  const on = buildStartupSummary({ realExecutionEnabled: true, allowedRepositories: `${REPO}, github_pat_${"X".repeat(40)}`, draftTtlMinutes: 45, draftFilePath: ".contextguard-data/agent-drafts.json" });
  const text = on.join("\n");
  assert.match(text, /ENABLED - allowlist: touhaf00\/tp-cicd, \(invalid entry hidden\)/);
  assert.match(text, /WARNING/);
  assert.match(text, /kept 45 min, saved to/);
  assert.doesNotMatch(text, /github_pat_/);

  const none = buildStartupSummary({ realExecutionEnabled: true, allowedRepositories: undefined, draftTtlMinutes: 60, draftFilePath: undefined });
  assert.match(none.join("\n"), /none configured/);
});

function flowWith(extra = {}) {
  const trusted = { repository: REPO, branch: BRANCH, investigated_sha: SHA, issue: { title: TITLE, body: BODY } };
  return new GitHubUiFlowV2({
    authorizationService: {}, executionContextStore: {},
    snapshotResolver: { resolver_version: "2", resolver_id: "test", provider: "github", supports: () => true,
      async resolve(subject) { return { snapshot_id: "a", subject, version: SHA, observed_at: new Date().toISOString() }; } },
    agentPipeline: { runtimeIdentity() { return { platform: "cominty", worker_agent_id: "w", guard_agent_id: "g", tool_scope: ["github.read"] }; }, async run() { throw new Error("must not run"); } },
    getAgentDraft: id => (id === "01234567-89ab-4def-8012-3456789abcde" ? trusted : undefined),
    ...extra
  });
}
const ID = "01234567-89ab-4def-8012-3456789abcde";
const base = { repository: REPO, target: { kind: "branch", ref: BRANCH }, issue: { title: TITLE, body: BODY }, draft_id: ID };

test("Refusals say precisely why: expired, unknown, or which fields changed", async () => {
  const flow = flowWith({ explainMissingAgentDraft: id => (id.startsWith("22222222") ? "expired" : "unknown") });
  const reject = async (body, pattern) => {
    await assert.rejects(flow.start(body), error => {
      assert.ok(error instanceof GitHubUiFlowErrorV2);
      assert.equal(error.code, "INVALID_ISSUE");
      assert.match(error.message, pattern);
      assert.match(error.message, /Generate a fresh draft/);
      return true;
    });
  };
  await reject({ ...base, draft_id: "22222222-2222-4222-8222-222222222222" }, /has expired/);
  await reject({ ...base, draft_id: "11111111-1111-4111-8111-111111111111" }, /no record of that agent draft/);
  await reject({ ...base, issue: { ...base.issue, title: "changed" } }, /changed: title\)/);
  await reject({ ...base, issue: { title: "x1", body: "y1" } }, /changed: title, body\)/);
  await reject({ ...base, target: { kind: "branch", ref: "develop" } }, /changed: branch\)/);
  await reject({ ...base, repository: "someone/else" }, /changed: repository\)/);
});

test("Without an explainer the original combined message is kept, and no draft text leaks", async () => {
  const flow = flowWith();
  await assert.rejects(flow.start({ ...base, draft_id: "11111111-1111-4111-8111-111111111111" }),
    error => /expired, changed, or did not match/.test(error.message));
  await assert.rejects(flow.start({ ...base, issue: { ...base.issue, body: "different" } }),
    error => !error.message.includes(BODY) && !error.message.includes(TITLE));
});

test("Server and browser are wired to the new behavior", async () => {
  const server = await readFile(new URL("../src/server.ts", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.match(server, /getAgentDraftStoreConfig\(\)/);
  assert.match(server, /explainMissingAgentDraft/);
  assert.match(server, /buildStartupSummary\(/);
  assert.match(app, /"REQUEST REFUSED"/);
  assert.match(app, /"UI UNAUTHORIZED"/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readAgentJsonWithOneFormatRepair, AGENT_FORMAT_REPAIR_NOTE, previewAgentReply } from "../dist/api/ui/agent-json.js";
import { agentOutputInvalidHttpError } from "../dist/api/ui/guard-invariant-error.js";

const PROMPT = "GUARD PROMPT: verify the claims and return the OUTPUT CONTRACT JSON.";
function agent(replies) {
  const calls = [];
  return { calls, async start(message) { calls.push(message); const r = replies[calls.length - 1]; if (r instanceof Error) throw r; return r; } };
}
function run(stage, replies, extra = {}) {
  const a = agent(replies); const warnings = [];
  const promise = readAgentJsonWithOneFormatRepair({ stage, prompt: PROMPT, start: m => a.start(m), warn: (message, details) => warnings.push({ message, details }), ...extra });
  return { a, warnings, promise };
}

test("Code fix: a reply that contains JSON costs exactly one call and no repair", async () => {
  const r = run("GUARD", ['Here you go:\n```json\n{"verdict":"REVIEW"}\n```']);
  assert.deepEqual(await r.promise, { verdict: "REVIEW" });
  assert.deepEqual(r.a.calls, [PROMPT]);
  assert.equal(r.warnings.length, 0);
});

test("Code fix: whatever the JSON decides, it is returned unchanged and never retried", async () => {
  for (const reply of ['{"verdict":"PASS","findings":[]}', '{"verdict":"FAIL"}', '{"decision":"READY","claims":[]}', '{}']) {
    const r = run("GUARD", [reply, '{"verdict":"SOMETHING ELSE"}']);
    assert.deepEqual(await r.promise, JSON.parse(reply));
    assert.equal(r.a.calls.length, 1);
  }
});

test("Code fix: a reply with no JSON gets exactly one fresh, neutral format repair", async () => {
  const r = run("GUARD", ["I could not complete this verification.", '{"verdict":"REVIEW"}']);
  assert.deepEqual(await r.promise, { verdict: "REVIEW" });
  assert.equal(r.a.calls.length, 2);
  assert.equal(r.a.calls[0], PROMPT);
  assert.equal(r.a.calls[1], PROMPT + AGENT_FORMAT_REPAIR_NOTE);
  assert.equal(r.warnings.length, 1);
  assert.equal(r.warnings[0].details.attempt, 1);
  assert.match(r.warnings[0].details.preview, /could not complete/);
});

test("Code fix: an empty reply and a truncated JSON object are both repaired once", async () => {
  for (const bad of ["", "   \n", '{"verdict":"REVIEW","findings":[{"finding_id":"F1"']) {
    const r = run("WORKER", [bad, '{"decision":"UNKNOWN"}']);
    assert.deepEqual(await r.promise, { decision: "UNKNOWN" });
    assert.equal(r.a.calls.length, 2);
  }
});

test("Code fix: two unusable replies fail closed after exactly two calls, with a typed non-authorizing error", async () => {
  const g = run("GUARD", ["no json", "still no json"]);
  await assert.rejects(g.promise, /^Error: AGENT_GUARD_OUTPUT_INVALID: .*No GitHub write is authorized\./);
  assert.equal(g.a.calls.length, 2);
  assert.deepEqual(g.warnings.map(w => w.details.attempt), [1, 2]);
  const w = run("WORKER", ["no json", "still no json"]);
  await assert.rejects(w.promise, /AGENT_WORKER_OUTPUT_INVALID/);
  assert.equal(w.a.calls.length, 2);
});

test("Code fix: the repair note is formatting-only: it names no verdict and carries nothing from the previous reply", async () => {
  assert.doesNotMatch(AGENT_FORMAT_REPAIR_NOTE, /\b(PASS|REVIEW|FAIL|READY|NOT_READY|UNKNOWN)\b/);
  assert.doesNotMatch(AGENT_FORMAT_REPAIR_NOTE, /approv|authoriz|should|must conclude/i);
  assert.match(AGENT_FORMAT_REPAIR_NOTE, /formatting only/);
  const r = run("GUARD", ["SECRET-PREVIOUS-REPLY-TEXT without braces", '{"verdict":"FAIL"}']);
  await r.promise;
  assert.equal(r.a.calls[1], PROMPT + AGENT_FORMAT_REPAIR_NOTE);
  assert.doesNotMatch(r.a.calls[1], /SECRET-PREVIOUS-REPLY-TEXT/);
});

test("Code fix: an infrastructure error on the FIRST call is not disguised as a format problem and is not retried", async () => {
  const boom = new Error("Cominty unreachable");
  const r = run("GUARD", [boom, '{"verdict":"PASS"}']);
  await assert.rejects(r.promise, /Cominty unreachable/);
  assert.equal(r.a.calls.length, 1);
});

test("Code fix: an error on the repair call fails closed after exactly two calls", async () => {
  const r = run("GUARD", ["no json", new Error("network down"), '{"verdict":"PASS"}']);
  await assert.rejects(r.promise, /AGENT_GUARD_OUTPUT_INVALID/);
  assert.equal(r.a.calls.length, 2);
});

test("Code fix: a diagnostic that throws can never change the outcome", async () => {
  const r = run("GUARD", ["no json", '{"verdict":"REVIEW"}'], { warn: () => { throw new Error("log broken"); } });
  assert.deepEqual(await r.promise, { verdict: "REVIEW" });
  const f = run("GUARD", ["no json", "no json"], { warn: () => { throw new Error("log broken"); } });
  await assert.rejects(f.promise, /AGENT_GUARD_OUTPUT_INVALID/);
});

test("Code fix: the logged preview is short, single-line and redacts token-like values", () => {
  const token = "gh" + "p_" + "A1b2C3d4E5".repeat(4);
  const pat = "github_" + "pat_" + "Z9y8X7w6V5".repeat(3);
  const out = previewAgentReply(`line1\nline2\u0007 ${token} and ${pat} and Bearer abcdefghijklmnop12345 ${"x".repeat(900)}`);
  assert.ok(out.length <= 300);
  assert.doesNotMatch(out, /[\n\r\u0000-\u001f]/);
  assert.doesNotMatch(out, /ghp_|github_pat_|abcdefghijklmnop12345/);
  assert.match(out, /\[redacted\]/);
  assert.equal(previewAgentReply(undefined), "");
  assert.equal(previewAgentReply(42), "");
  assert.equal(previewAgentReply(""), "");
});

test("Code fix: the HTTP error is fixed text, names the agent, and never echoes anything from the model", async () => {
  const g = run("GUARD", ["<script>alert(1)</script> no json", "ghp_" + "Q".repeat(30) + " no json"]);
  let thrown; try { await g.promise; } catch (e) { thrown = e; }
  const mapped = agentOutputInvalidHttpError(thrown);
  assert.equal(mapped.status, 502);
  assert.match(mapped.message, /independent Guard/);
  assert.match(mapped.message, /No authorization was issued and nothing was written to GitHub/);
  assert.doesNotMatch(mapped.message, /script|ghp_|alert/);
  const w = agentOutputInvalidHttpError(new Error("AGENT_WORKER_OUTPUT_INVALID: whatever the model said"));
  assert.match(w.message, /Cominty Worker/);
  assert.doesNotMatch(w.message, /whatever the model said/);
  assert.doesNotMatch(mapped.message, /\bPASS\b|approved/);
});

test("Code fix: only the typed agent-output errors are mapped", () => {
  for (const v of [new Error("Agent response does not contain JSON."), new Error("Internal"), new Error("note AGENT_GUARD_OUTPUT_INVALID: embedded"),
      new Error("AGENT_DISCOVERY_OUTPUT_INVALID: x"), "AGENT_GUARD_OUTPUT_INVALID: string", null, undefined, {}]) {
    assert.equal(agentOutputInvalidHttpError(v), null, String(v));
  }
});

test("Code fix: the pipeline and the server are wired to the repair and to the readable error", () => {
  const pipeline = readFileSync(new URL("../src/api/ui/cominty-pipeline.ts", import.meta.url), "utf8");
  assert.match(pipeline, /import \{\s*readAgentJsonWithOneFormatRepair\s*\} from "\.\/agent-json\.js";/);
  assert.match(pipeline, /readAgentJsonWithOneFormatRepair<unknown>\(\{\s*stage: "WORKER"/);
  assert.match(pipeline, /readAgentJsonWithOneFormatRepair<unknown>\(\{\s*stage: "GUARD"/);
  assert.doesNotMatch(pipeline, /extractJson/, "no direct, repair-less JSON extraction may remain in the pipeline");
  const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.match(server, /agentOutputInvalidHttpError/);
  const start = server.indexOf("function contextGuardUiHttpError(");
  const end = server.indexOf("\n}\n", start);
  assert.match(server.slice(start, end), /agentOutputInvalidHttpError\(\s*error\s*\)/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { APIError, InvalidParams } from "@cominty-ai/sdk";
import { MEMORYLESS_THREAD, startAgentThread } from "../dist/cominty.js";

function fakeClient(behaviour = () => ({ async text() { return "ok"; } })) {
  const calls = [];
  return { calls, chat: { async start(params) { calls.push(params); return behaviour(params); } } };
}
const shaped = (Class, fields) => Object.assign(Object.create(Class.prototype), fields);

test("An agent thread is started without memory, whatever the agent's own setting", async () => {
  const client = fakeClient();
  const run = await startAgentThread(client, { agentId: "guard", message: "verify" });
  assert.equal(await run.text(), "ok");
  assert.deepEqual(client.calls, [{ agentId: "guard", message: "verify", threadCapabilities: { memory: { activation: "never" } } }]);
  assert.deepEqual(MEMORYLESS_THREAD, { memory: { activation: "never" } });
});

test("Any other failure is passed on unchanged and nothing is retried", async () => {
  for (const error of [shaped(APIError, { status: 500, message: "boom" }), new Error("network")]) {
    const client = fakeClient(() => { throw error; });
    await assert.rejects(startAgentThread(client, { agentId: "worker", message: "m" }), thrown => thrown === error);
    assert.equal(client.calls.length, 1);
  }
});

test("A refused override is retried once without it, and a different problem is never hidden", async () => {
  const always = fakeClient(() => { throw shaped(APIError, { status: 422, message: "bad" }); });
  await assert.rejects(startAgentThread(always, { agentId: "worker", message: "m" }), thrown => thrown instanceof APIError);
  assert.equal(always.calls.length, 2);
  assert.ok("threadCapabilities" in always.calls[0] && !("threadCapabilities" in always.calls[1]));

  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => { warnings.push(args.join(" ")); };
  try {
    const refusing = fakeClient(params => {
      if (params.threadCapabilities) throw shaped(InvalidParams, { message: "unknown capability" });
      return { async text() { return "fallback"; } };
    });
    const run = await startAgentThread(refusing, { agentId: "worker", message: "m" });
    assert.equal(await run.text(), "fallback");
    await startAgentThread(refusing, { agentId: "guard", message: "n" });
    assert.equal(refusing.calls.length, 3);
    assert.ok(!("threadCapabilities" in refusing.calls[2]), "after one refusal the override is no longer sent");
  } finally {
    console.warn = warn;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /refused the per-thread memory override/);
});

test("Every agent call goes through the memory-less start", () => {
  for (const file of ["src/api/ui/cominty-pipeline.ts", "src/api/ui/agent-issue-draft.ts", "src/agents/worker.ts", "src/agents/guard.ts"]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /startAgentThread\(/, file);
    assert.doesNotMatch(source, /\.chat\.start\(/, `${file} must not start a thread with the agent's own memory`);
  }
});

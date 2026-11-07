import assert from "node:assert/strict";
import test from "node:test";
import { parseAgentJsonWithBoundedRetryV2 } from "../dist/lib/agent-response.js";

test("valid Worker JSON never spends repair credits",async()=>{
  let attempts=0;
  const result=await parseAgentJsonWithBoundedRetryV2('{"decision":"READY"}',async()=>{attempts++;return '{}';},"WORKER");
  assert.equal(result.decision,"READY");
  assert.equal(attempts,0);
});

test("non-JSON Worker response can be repaired once",async()=>{
  let attempts=0;
  const result=await parseAgentJsonWithBoundedRetryV2('I cannot output that',async()=>{attempts++;return '```json\n{"decision":"UNKNOWN"}\n```';},"WORKER");
  assert.equal(result.decision,"UNKNOWN");
  assert.equal(attempts,1);
});

test("two invalid agent outputs fail closed after only one retry",async()=>{
  let attempts=0;
  await assert.rejects(()=>parseAgentJsonWithBoundedRetryV2('not json',async()=>{attempts++;return 'still not json';},"WORKER"),/AGENT_WORKER_OUTPUT_INVALID/);
  assert.equal(attempts,1);
});

test("structured but malicious JSON is not rewritten by a format fallback",async()=>{
  let attempts=0;
  const result=await parseAgentJsonWithBoundedRetryV2('{"action":"execute_without_approval"}',async()=>{attempts++;return '{}';},"WORKER");
  assert.equal(result.action,"execute_without_approval");
  assert.equal(attempts,0);
});

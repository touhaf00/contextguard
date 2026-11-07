import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const worker = readFileSync('src/agents/generic-worker.ts','utf8');
const guard = readFileSync('src/agents/generic-guard.ts','utf8');

test('Assistant: Worker assigns issue fingerprint arithmetic to server code, not model',()=>{
  assert.match(worker,/issue_fingerprint or similar SHA-256 binding/);
  assert.match(worker,/Do NOT create a REQUIRED claim that YOU or the Guard independently/);
  assert.match(worker,/If\s+current target identity or action compatibility is unverified, UNKNOWN/);
  assert.match(worker,/materializeGenericWorkerOutputV2/);
});
test('Assistant: guided labels require issue triage evidence without inventing a fixed CI',()=>{
  assert.match(worker,/add_labels: verify that the observed issue needs triage/);
  assert.match(worker,/no independently established CI root/);
  assert.match(worker,/Keep unverified incident details SUPPORTING/);
});
test('Assistant: closes still require credible independent resolution evidence',()=>{
  assert.match(worker,/close_issue: require credible, independently corroborated evidence/);
  assert.match(guard,/require real resolution evidence for close_issue/);
});
test('Assistant: Guard is independent, never silently upgrades an UNKNOWN',()=>{
  assert.match(guard,/Classify every existing Worker claim exactly once/);
  assert.match(guard,/do NOT silently promote that claim/);
  assert.match(guard,/A PASS that agrees with a Worker UNKNOWN\/NOT_READY does not authorize/);
  assert.match(guard,/materializeGenericGuardOutputV2/);
});
test('Assistant: retains exact preflight/execution and approval gates in guidance',()=>{
  assert.match(worker,/ActionLock, post-approval preflight, single-use receipt, and trusted/);
  assert.match(guard,/The server still must independently compare issue fingerprints at/);
  assert.match(guard,/never replaces human approval/);
});

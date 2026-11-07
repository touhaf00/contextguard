import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  GUARD_INVARIANT_PUBLIC_MESSAGE,
  WORKER_INVARIANT_PUBLIC_MESSAGE,
  guardInvariantHttpError,
  workerInvariantHttpError
} from "../dist/api/ui/guard-invariant-error.js";

const BLOCKED =
  "WorkerAssessmentV2 invariant violated: READY requires every REQUIRED claim to be SUPPORTED. Required claims not SUPPORTED: C2=UNKNOWN.";

test("Worker invariant: a READY that contradicts its own REQUIRED claims becomes a readable 502", () => {
  assert.deepEqual(workerInvariantHttpError(new Error(BLOCKED)), {
    status: 502,
    message: WORKER_INVARIANT_PUBLIC_MESSAGE
  });
  assert.deepEqual(
    workerInvariantHttpError(new Error("Worker invariant violated: READY requires every REQUIRED claim to be SUPPORTED.")),
    { status: 502, message: WORKER_INVARIANT_PUBLIC_MESSAGE }
  );
});

test("Worker invariant: the public message echoes no claim identifier and never suggests a PASS or an approval", () => {
  const { message } = workerInvariantHttpError(new Error(BLOCKED));
  assert.doesNotMatch(message, /C2|UNKNOWN/);
  assert.match(message, /No authorization was issued/);
  assert.match(message, /nothing was written to GitHub/);
  assert.doesNotMatch(message, /\bPASS\b|approved|authorized the/i);
});

test("Worker invariant: unrelated errors are not mistaken for it, and Guard errors keep their own mapping", () => {
  for (const value of [
    new Error("WorkerAssessmentV2.decision is invalid."),
    new Error("Guard invariant violated: PASS cannot contain findings."),
    "WorkerAssessmentV2 invariant violated: not an Error object",
    null
  ]) {
    assert.equal(workerInvariantHttpError(value), null, String(value));
  }
  assert.equal(guardInvariantHttpError(new Error(BLOCKED)), null);
  assert.notEqual(WORKER_INVARIANT_PUBLIC_MESSAGE, GUARD_INVARIANT_PUBLIC_MESSAGE);
});

test("Worker invariant: the server maps it before the generic pipeline error", () => {
  const source = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.match(
    source,
    /import \{[^}]*\bworkerInvariantHttpError\b[^}]*\} from "\.\/api\/ui\/guard-invariant-error\.js";/
  );
  const start = source.indexOf("function contextGuardUiHttpError(");
  assert.notEqual(start, -1);
  const end = source.indexOf("\n}\n", start);
  const body = source.slice(start, end);
  assert.match(body, /workerInvariantHttpError\(\s*error\s*\)/);
  assert.ok(
    body.indexOf("workerInvariantHttpError(") < body.indexOf("agentOutputInvalidHttpError("),
    "the Worker mapping must come before the generic pipeline mapping"
  );
});

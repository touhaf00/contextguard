import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  GUARD_INVARIANT_PUBLIC_MESSAGE,
  guardInvariantHttpError
} from "../dist/api/ui/guard-invariant-error.js";

test("Code fix: a Guard invariant violation becomes a readable 502 instead of a generic 500", () => {
  const mapped = guardInvariantHttpError(
    new Error("Guard invariant violated: REVIEW cannot be based on LOW-only findings.")
  );
  assert.deepEqual(mapped, { status: 502, message: GUARD_INVARIANT_PUBLIC_MESSAGE });
  assert.match(mapped.message, /No authorization was issued/);
  assert.match(mapped.message, /nothing was written to GitHub/);
});

test("Code fix: the raw validator message and model-originated identifiers are never echoed", () => {
  const hostile = new Error(
    "Guard invariant violated: READY + PASS requires REQUIRED Worker claim <img src=x onerror=alert(1)> to be independently verified."
  );
  const mapped = guardInvariantHttpError(hostile);
  assert.equal(mapped.message, GUARD_INVARIANT_PUBLIC_MESSAGE);
  assert.doesNotMatch(mapped.message, /onerror|<img|claim </);
  assert.doesNotMatch(mapped.message, /Guard invariant violated/);
});

test("Code fix: the public message never suggests a PASS or an approval", () => {
  assert.doesNotMatch(GUARD_INVARIANT_PUBLIC_MESSAGE, /\bPASS\b|approved|authorized the/i);
});

test("Code fix: only errors that START with the Guard invariant prefix are mapped", () => {
  for (const value of [
    new Error("Internal failure"),
    new TypeError("x is not a function"),
    new Error("Worker invariant violated: something"),
    new Error("note: Guard invariant violated: embedded mid-message"),
    new Error(""),
    "Guard invariant violated: a string, not an Error",
    { message: "Guard invariant violated: a plain object" },
    null,
    undefined
  ]) {
    assert.equal(guardInvariantHttpError(value), null, String(value));
  }
});

test("Code fix: server.ts routes Guard invariant errors through the mapper inside contextGuardUiHttpError", () => {
  const source = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.match(source, /import \{[^}]*\bguardInvariantHttpError\b[^}]*\} from "\.\/api\/ui\/guard-invariant-error\.js";/);
  const start = source.indexOf("function contextGuardUiHttpError(");
  const end = source.indexOf("\n}\n", start);
  assert.ok(start > 0 && end > start);
  const body = source.slice(start, end);
  assert.match(body, /guardInvariantHttpError\(\s*error\s*\)/);
  assert.match(body, /new HttpError\(\s*guardInvariant\.status,\s*guardInvariant\.message\s*\)/);
});

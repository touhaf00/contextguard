import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

await import("../public/playground-lab.js");

const model = globalThis.ContextGuardInteractiveLab;
const original = {
  sha: model.BASE_SHA,
  title: model.BASE_TITLE,
  ciEvidence: true
};

test("Lab: model exposes interactive authorization logic", () => {
  assert.equal(typeof model.evaluate, "function");
  assert.equal(model.stages.length, 8);
});

test("Lab: requires approval", () => {
  assert.match(
    model.evaluate(null, original).verdict,
    /WAITING/
  );
});

test("Lab: authorizes unchanged example only in simulation", () => {
  assert.equal(
    model.evaluate(original, original, "fresh", "approved").verdict,
    "AUTHORIZED · SIMULATION ONLY"
  );
});

test("Lab: detects manual commit drift", () => {
  const result = model.evaluate(
    original,
    { ...original, sha: "f".repeat(40) },
    "fresh",
    "approved"
  );

  assert.match(result.verdict, /COMMIT DRIFT/);
  assert.equal(result.stages[5].state, "blocked");
});

test("Lab: detects modified issue title", () => {
  const result = model.evaluate(
    original,
    { ...original, title: "Changed action" },
    "fresh",
    "approved"
  );

  assert.match(result.verdict, /ACTION TAMPERING/);
});

test("Lab: blocks missing evidence", () => {
  const result = model.evaluate(
    original,
    { ...original, ciEvidence: false },
    "fresh",
    "approved"
  );

  assert.match(result.verdict, /EVIDENCE GAP/);
  assert.equal(result.stages[2].state, "blocked");
});

test("Lab: refuses replay and expiry", () => {
  for (const receipt of ["consumed", "expired"]) {
    const result = model.evaluate(
      original, original, receipt, "approved"
    );
    assert.match(result.verdict, /BLOCKED/);
    assert.equal(result.stages[6].state, "blocked");
  }
});

test("Lab: honors rejection and validates SHA", () => {
  assert.match(
    model.evaluate(null, original, "fresh", "rejected").verdict,
    /HUMAN REJECTION/
  );
  assert.match(
    model.evaluate(original, { ...original, sha: "abc" },
      "fresh", "approved").verdict,
    /INVALID INPUT/
  );
});

test("Lab: remains an isolated browser simulation", () => {
  const js = readFileSync(
    new URL("../public/playground-lab.js", import.meta.url),
    "utf8"
  );
  const html = readFileSync(
    new URL("../public/playground.html", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(js, /\bfetch\s*\(/);
  assert.doesNotMatch(js, /\/api\//);
  assert.match(html, /playground-lab\.js/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

await import("../public/playground-core.js");

const model = globalThis.ContextGuardPlaygroundModel;

test("Playground model is available", () => {
  assert.ok(model);
  assert.equal(typeof model.evaluate, "function");
});

test("An action cannot proceed without human approval", () => {
  const result = model.evaluate("none", null);
  assert.match(result.status, /WAITING/);
});

test("Human rejection blocks the action", () => {
  const result = model.evaluate("none", false);
  assert.equal(result.status, "BLOCKED · HUMAN REJECTION");
});

test("Unchanged approved action reaches simulated authorization", () => {
  const result = model.evaluate("none", true);
  assert.match(result.status, /AUTHORIZED/);
});

test("Changed commit SHA is blocked", () => {
  const result = model.evaluate("drift", true);
  assert.equal(result.status, "BLOCKED · CONTEXT CHANGED");
});

test("Modified approved action is blocked", () => {
  const result = model.evaluate("tamper", true);
  assert.equal(result.status, "BLOCKED · ACTION TAMPERING");
});

test("Missing evidence prevents authorization", () => {
  const result = model.evaluate("missing", true);
  assert.equal(result.status, "BLOCKED · EVIDENCE GAP");
});

test("Consumed receipt cannot be reused", () => {
  const result = model.evaluate("replay", true);
  assert.equal(result.status, "BLOCKED · RECEIPT REPLAY");
});

test("Expired receipt is rejected", () => {
  const result = model.evaluate("expired", true);
  assert.equal(result.status, "BLOCKED · EXPIRED RECEIPT");
});

test("Every scenario produces a simulated audit trail", () => {
  for (const scenario of Object.keys(model.attacks)) {
    const result = model.evaluate(scenario, true);

    assert.ok(result.trace.length >= 3);
    assert.match(
      result.trace.at(-1),
      /AUDIT/
    );
  }
});

test("Public demonstration contains no API requests", () => {
  const js = readFileSync(
    new URL("../public/playground-core.js", import.meta.url),
    "utf8"
  );

  assert.doesNotMatch(js, /\bfetch\s*\(/);
  assert.doesNotMatch(js, /\bXMLHttpRequest\b/);
  assert.doesNotMatch(js, /\/api\//);
});

test("Playground is clearly identified as a simulation", () => {
  const html = readFileSync(
    new URL("../public/playground.html", import.meta.url),
    "utf8"
  );

  assert.match(html, /INTERACTIVE SIMULATION/);
  assert.match(html, /EDUCATIONAL SIMULATION/);
});

test("Try Demo opens the new Playground", () => {
  const js = readFileSync(
    new URL("../public/app.js", import.meta.url),
    "utf8"
  );

  assert.match(
    js,
    /window\.location\.assign\("\/playground\.html"\)/
  );
});

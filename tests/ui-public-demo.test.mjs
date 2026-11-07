import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const html = readFileSync(
  new URL("../public/index.html", import.meta.url),
  "utf8"
);

const js = readFileSync(
  new URL("../public/app.js", import.meta.url),
  "utf8"
);

test("public demo is accessible without a login", () => {
  assert.match(html, /id="tryDemoButton"/);
  assert.match(html, /id="publicDemoPanel"/);
  assert.match(html, /id="demoScenario"/);
  assert.match(html, /SIMULATION ONLY/);
});

test("public demo has distinct unchanged and drift scenarios", () => {
  assert.match(html, /value="unchanged"/);
  assert.match(html, /value="drift"/);
  assert.match(js, /BLOCKED · CONTEXT CHANGED/);
  assert.match(js, /publicDemoRejected/);
});

test("demo controller cannot call an external API", () => {
  const start = js.indexOf("let publicDemoStep = 0;");
  const end = js.indexOf(
    "function authenticatedPrincipalLabel(",
    start
  );
  assert.ok(start >= 0 && end > start);
  const controller = js.slice(start, end);
  assert.doesNotMatch(controller, /\bfetch\s*\(/);
  assert.doesNotMatch(controller, /\bpostUi\s*\(/);
  assert.doesNotMatch(controller, /\brequestSession\s*\(/);
  assert.doesNotMatch(controller, /\/api\//);
});

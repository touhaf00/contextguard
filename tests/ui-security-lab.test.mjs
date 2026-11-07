import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const js = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../public/styles.css", import.meta.url), "utf8");

test("Security lab UI exposes standard and manual real-drift scenarios", () => {
  assert.match(html, /id="securityLabMode"/);
  assert.match(html, /value="normal"/);
  assert.match(html, /value="manual_drift"/);
  assert.match(html, /id="securityLabResult"/);
  assert.match(html, /id="securityLabClaims"/);
  assert.match(css, /\.security-lab-evidence/);
});

test("Security lab UI renders real Worker and Guard claims without HTML injection", () => {
  assert.match(js, /function renderSecurityLabEvidence\(result\)/);
  assert.match(js, /new Set\(guard\.verified_claims/);
  assert.match(js, /new Set\(guard\.unverified_claims/);
  assert.match(js, /new Set\(guard\.contradicted_claims/);
  assert.match(js, /document\.createElement\("li"\)/);
  assert.match(js, /li\.textContent/);
});

test("manual drift mode retains server preflight and never creates an execution receipt", () => {
  assert.match(js, /"\/api\/ui\/preflight"/);
  assert.match(js, /preflightCode === "SNAPSHOT_CHANGED"/);
  assert.match(js, /"MATCH · NO DRIFT"/);
  assert.match(js, /elements\.receiptButton\.disabled = true/);
  assert.match(js, /elements\.securityLabMode\.disabled = true/);
  assert.doesNotMatch(js, /"\/api\/ui\/push"/);
  assert.doesNotMatch(js, /"\/api\/ui\/commit"/);
});


test("UI HTTP maps actual SNAPSHOT_CHANGED to a safe 409 response", async () => {
  const { GenericPreflightError } = await import("../dist/core/preflight.js");
  const { contextGuardUiPreflightErrorResponseV2 } =
    await import("../dist/api/ui/http.js");
  const result = contextGuardUiPreflightErrorResponseV2(
    new GenericPreflightError("SNAPSHOT_CHANGED", "GitHub snapshot changed.")
  );
  assert.equal(result.status, 409);
  assert.equal(result.body.error.code, "SNAPSHOT_CHANGED");
  assert.match(result.body.error.message, /snapshot changed/);
});

test("UI HTTP does not misclassify unexpected errors", async () => {
  const { contextGuardUiPreflightErrorResponseV2 } =
    await import("../dist/api/ui/http.js");
  assert.equal(contextGuardUiPreflightErrorResponseV2(new Error("unknown")), null);
});

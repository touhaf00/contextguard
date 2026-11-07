import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWorkerEvidenceFreshnessGuidanceV2,
  classifyWorkerStaleEvidenceV2,
  WorkerEvidenceStaleErrorV2
} from "../dist/api/ui/worker-evidence-freshness.js";

test("freshness prompt distinguishes a historical event time from observation time", () => {
  const prompt = buildWorkerEvidenceFreshnessGuidanceV2(900, {
    branch: {observed_at: "2026-11-05T00:00:00Z"},
    files: {observed_at: "2026-11-05T00:00:10Z"}
  }, "2026-11-05T00:00:15Z");
  assert.match(prompt, /900 seconds/);
  assert.match(prompt, /2026-11-05T00:00:10Z/);
  assert.match(prompt, /not the date when the commit was authored/);
  assert.match(prompt, /use UNKNOWN instead/);
  assert.match(prompt, /never manufacture freshness/);
});

test("real stale E2 becomes an explicit non-authorizing error without changing values", () => {
  const output = {
    assembled_at: "2026-11-05T00:30:00Z",
    evidence: [{evidence_id: "E2", locator: "private-untrusted-url",
      source_snapshot: {observed_at: "2026-11-04T23:00:00Z"}}]
  };
  const pristine = structuredClone(output);
  const err = classifyWorkerStaleEvidenceV2(
    new Error("EvidenceProtocolV2.claims[0] references stale decision-critical evidence: E2."),
    output, 900
  );
  assert.ok(err instanceof WorkerEvidenceStaleErrorV2);
  assert.equal(err.code, "STALE_DECISION_CRITICAL_EVIDENCE");
  assert.equal(err.evidenceId, "E2");
  assert.equal(err.ageSeconds, 5400);
  assert.doesNotMatch(err.message, /private-untrusted-url/);
  assert.deepEqual(output, pristine);
});

test("unrelated validation errors never become freshness diagnostics", () => {
  assert.equal(classifyWorkerStaleEvidenceV2(
    new Error("Invalid SHA"), {evidence: []}, 900
  ), null);
});

test("untrusted evidence identifiers do not leak raw output", () => {
  assert.equal(classifyWorkerStaleEvidenceV2(
    new Error("EvidenceProtocolV2.claims[0] references stale decision-critical evidence: javascript:<script>."),
    {assembled_at: "2026-11-05T00:00:00Z"}, 900
  ), null);
});

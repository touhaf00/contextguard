import assert from "node:assert/strict";
import test from "node:test";

import {
  validateGuardReport,
  validateWorkerReport
} from "../dist/lib/validate-report.js";

function validWorker(
  overrides = {}
) {
  return {
    decision: "READY",
    confidence: 0.85,
    summary: "Evidence supports the decision.",
    ...overrides
  };
}

function validGuard(
  overrides = {}
) {
  return {
    verdict: "PASS",
    evidence_coverage: 0.9,
    claim_accuracy: 0.95,
    risk: "LOW",
    findings: [],
    requested_checks: [],
    allowed_to_act: true,
    retry_recommended: false,
    summary: "Worker claims are sufficiently supported.",
    ...overrides
  };
}

test(
  "accepts a valid Worker report",
  () => {
    const report =
      validateWorkerReport(
        validWorker()
      );

    assert.equal(
      report.decision,
      "READY"
    );
  }
);

test(
  "rejects an invalid Worker decision",
  () => {
    assert.throws(
      () =>
        validateWorkerReport(
          validWorker({
            decision: "MAYBE"
          })
        ),
      /decision/
    );
  }
);

test(
  "rejects Worker confidence above 1",
  () => {
    assert.throws(
      () =>
        validateWorkerReport(
          validWorker({
            confidence: 1.2
          })
        ),
      /between 0 and 1/
    );
  }
);

test(
  "rejects an empty Worker summary",
  () => {
    assert.throws(
      () =>
        validateWorkerReport(
          validWorker({
            summary: "   "
          })
        ),
      /summary/
    );
  }
);

test(
  "accepts a valid PASS Guard report",
  () => {
    const report =
      validateGuardReport(
        validGuard()
      );

    assert.equal(
      report.verdict,
      "PASS"
    );
  }
);

test(
  "accepts terminal REVIEW without retry",
  () => {
    const report =
      validateGuardReport(
        validGuard({
          verdict: "REVIEW",
          risk: "MEDIUM",
          allowed_to_act: false,
          retry_recommended: false
        })
      );

    assert.equal(
      report.retry_recommended,
      false
    );
  }
);

test(
  "accepts REVIEW with an actionable retry check",
  () => {
    const report =
      validateGuardReport(
        validGuard({
          verdict: "REVIEW",
          risk: "MEDIUM",
          allowed_to_act: false,
          retry_recommended: true,
          requested_checks: [
            {
              finding_id: "F1",
              check:
                "Inspect the target-specific workflow run."
            }
          ]
        })
      );

    assert.equal(
      report.retry_recommended,
      true
    );
  }
);

test(
  "rejects FAIL that allows action",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            verdict: "FAIL",
            risk: "HIGH",
            allowed_to_act: true
          })
        ),
      /cannot allow action/
    );
  }
);

test(
  "rejects PASS that recommends retry",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            retry_recommended: true,
            requested_checks: [
              {
                finding_id: "F1",
                check: "Retry something."
              }
            ]
          })
        ),
      /only REVIEW/
    );
  }
);

test(
  "rejects REVIEW retry without actionable checks",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            verdict: "REVIEW",
            risk: "MEDIUM",
            allowed_to_act: false,
            retry_recommended: true,
            requested_checks: []
          })
        ),
      /requires an actionable check/
    );
  }
);

test(
  "rejects malformed requested checks",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            verdict: "REVIEW",
            risk: "MEDIUM",
            allowed_to_act: false,
            retry_recommended: true,
            requested_checks: [
              {
                check:
                  "Missing finding id."
              }
            ]
          })
        ),
      /finding_id/
    );
  }
);

test(
  "rejects malformed findings",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            findings: [
              {
                id: "F1",
                type: "MISSING_EVIDENCE",
                severity: "EXTREME",
                description:
                  "Invalid severity."
              }
            ]
          })
        ),
      /severity/
    );
  }
);

test(
  "rejects Guard scores outside 0..1",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            evidence_coverage: 1.5
          })
        ),
      /between 0 and 1/
    );
  }
);

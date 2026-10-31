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

    target_resolution: {
      status: "RESOLVED",
      requested_type: "branch",
      requested_reference: "main",
      resolved_sha:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },

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
    worker_decision_supported:
      overrides.worker_decision_supported ??
      (
        overrides.verdict === undefined ||
        overrides.verdict === "PASS"
      ),

    allowed_to_act: true,
    retry_recommended: false,
    summary: "Worker claims are sufficiently supported.",

    target_resolution: {
      status: "RESOLVED",
      requested_type: "branch",
      requested_reference: "main",
      resolved_sha:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    },

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
          retry_recommended: false,
          findings: [
            {
              id: "F1",
              type: "MISSING_EVIDENCE",
              severity: "MEDIUM",
              description:
                "Decision-critical evidence is unavailable through the authorized integration.",
              required_check: null
            }
          ]
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
          findings: [
            {
              id: "F1",
              type: "MISSING_EVIDENCE",
              severity: "HIGH",
              description:
                "Decision-critical execution evidence requires one focused additional check.",
              required_check:
                "Inspect the exact workflow execution evidence."
            }
          ],

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


test(
  "rejects Worker report without target resolution",
  () => {
    const report =
      validWorker();

    delete report.target_resolution;

    assert.throws(
      () =>
        validateWorkerReport(
          report
        ),
      /target_resolution/
    );
  }
);

test(
  "rejects Guard report without target resolution",
  () => {
    const report =
      validGuard();

    delete report.target_resolution;

    assert.throws(
      () =>
        validateGuardReport(
          report
        ),
      /target_resolution/
    );
  }
);

test(
  "rejects an unknown finding type",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            verdict: "REVIEW",
            allowed_to_act: false,
            findings: [
              {
                id: "F1",
                type: "MADE_UP_TYPE",
                severity: "MEDIUM",
                description:
                  "Invalid finding type.",
                required_check: null
              }
            ]
          })
        ),
      /type/
    );
  }
);

test(
  "rejects duplicate finding ids",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            verdict: "REVIEW",
            allowed_to_act: false,
            findings: [
              {
                id: "F1",
                type: "MISSING_EVIDENCE",
                severity: "MEDIUM",
                description:
                  "First finding.",
                required_check: null
              },
              {
                id: "F1",
                type: "MISSING_EVIDENCE",
                severity: "MEDIUM",
                description:
                  "Duplicate finding.",
                required_check: null
              }
            ]
          })
        ),
      /duplicate id/
    );
  }
);

test(
  "rejects PASS containing findings",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            findings: [
              {
                id: "F1",
                type: "REASONING_ERROR",
                severity: "LOW",
                description:
                  "The Worker reasoning was actually correct.",
                required_check: null
              }
            ]
          })
        ),
      /PASS must not contain findings/
    );
  }
);

test(
  "rejects REVIEW without a finding",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            verdict: "REVIEW",
            allowed_to_act: false,
            findings: []
          })
        ),
      /REVIEW requires at least one finding/
    );
  }
);

test(
  "rejects requested check referencing missing finding",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            verdict: "REVIEW",
            allowed_to_act: false,
            retry_recommended: true,
            findings: [
              {
                id: "F1",
                type: "MISSING_EVIDENCE",
                severity: "HIGH",
                description:
                  "Evidence is missing.",
                required_check:
                  "Inspect the exact run."
              }
            ],
            requested_checks: [
              {
                finding_id: "F99",
                check:
                  "Inspect the exact run."
              }
            ]
          })
        ),
      /does not reference an existing finding/
    );
  }
);

test(
  "rejects requested checks when retry is false",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            verdict: "REVIEW",
            allowed_to_act: false,
            retry_recommended: false,
            findings: [
              {
                id: "F1",
                type: "MISSING_EVIDENCE",
                severity: "HIGH",
                description:
                  "Terminal evidence limitation.",
                required_check: null
              }
            ],
            requested_checks: [
              {
                finding_id: "F1",
                check:
                  "Retry unavailable evidence."
              }
            ]
          })
        ),
      /requested_checks must be empty/
    );
  }
);

test(
  "rejects terminal finding that still requires a check",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            verdict: "REVIEW",
            allowed_to_act: false,
            retry_recommended: false,
            findings: [
              {
                id: "F1",
                type: "MISSING_EVIDENCE",
                severity: "HIGH",
                description:
                  "Evidence is unavailable.",
                required_check:
                  "Try again."
              }
            ]
          })
        ),
      /cannot require another check/
    );
  }
);

test(
  "rejects FAIL without a material integrity finding",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            verdict: "FAIL",
            risk: "HIGH",
            allowed_to_act: false,
            findings: [
              {
                id: "F1",
                type: "MISSING_EVIDENCE",
                severity: "HIGH",
                description:
                  "Evidence is missing.",
                required_check: null
              }
            ]
          })
        ),
      /FAIL requires a HIGH or CRITICAL integrity finding/
    );
  }
);

test(
  "accepts a structurally valid FAIL",
  () => {
    const report =
      validateGuardReport(
        validGuard({
          verdict: "FAIL",
          risk: "CRITICAL",
          allowed_to_act: false,
          findings: [
            {
              id: "F1",
              type: "CONTRADICTION",
              severity: "CRITICAL",
              description:
                "Verified source evidence directly contradicts the Worker claim.",
              required_check: null
            }
          ]
        })
      );

    assert.equal(
      report.verdict,
      "FAIL"
    );
  }
);

test(
  "rejects REVIEW containing LOW findings",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            verdict: "REVIEW",
            allowed_to_act: false,
            retry_recommended: false,
            findings: [
              {
                id: "F1",
                type: "MISSING_EVIDENCE",
                severity: "LOW",
                description:
                  "Non-decision-critical limitation.",
                required_check: null
              }
            ]
          })
        ),
      /REVIEW cannot contain LOW findings/
    );
  }
);

test(
  "rejects REVIEW reasoning error without retry",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            verdict: "REVIEW",
            allowed_to_act: false,
            retry_recommended: false,
            findings: [
              {
                id: "F1",
                type: "REASONING_ERROR",
                severity: "MEDIUM",
                description:
                  "The Worker assessment requires correction.",
                required_check: null
              }
            ]
          })
        ),
      /requires a retry/
    );
  }
);

test(
  "rejects REVIEW unsupported claim without retry",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            verdict: "REVIEW",
            allowed_to_act: false,
            retry_recommended: false,
            findings: [
              {
                id: "F1",
                type: "UNSUPPORTED_CLAIM",
                severity: "MEDIUM",
                description:
                  "A decision-critical Worker claim requires correction.",
                required_check: null
              }
            ]
          })
        ),
      /requires a retry/
    );
  }
);

test(
  "rejects PASS when Worker decision is not supported",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            worker_decision_supported:
              false
          })
        ),
      /PASS requires worker_decision_supported=true/
    );
  }
);

test(
  "rejects REVIEW that still claims Worker decision is supported",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            verdict: "REVIEW",
            worker_decision_supported:
              true,
            allowed_to_act: false,
            retry_recommended: false,
            findings: [
              {
                id: "F1",
                type: "MISSING_EVIDENCE",
                severity: "MEDIUM",
                description:
                  "Decision-critical evidence remains unavailable.",
                required_check: null
              }
            ]
          })
        ),
      /REVIEW or FAIL requires worker_decision_supported=false/
    );
  }
);

test(
  "rejects FAIL that claims Worker decision is supported",
  () => {
    assert.throws(
      () =>
        validateGuardReport(
          validGuard({
            verdict: "FAIL",
            worker_decision_supported:
              true,
            allowed_to_act: false,
            risk: "CRITICAL",
            findings: [
              {
                id: "F1",
                type: "CONTRADICTION",
                severity: "CRITICAL",
                description:
                  "Verified evidence contradicts the Worker assessment.",
                required_check: null
              }
            ]
          })
        ),
      /REVIEW or FAIL requires worker_decision_supported=false/
    );
  }
);

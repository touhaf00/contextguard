import assert from "node:assert/strict";
import test from "node:test";

import {
  validateGuardReport,
  validateWorkerReport
} from "../dist/lib/validate-report.js";

const SHA =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function worker() {
  return validateWorkerReport(
    {
      decision: "READY",
      confidence: 0.9,
      summary:
        "Required evidence supports readiness.",

      target_resolution: {
        status: "RESOLVED",
        requested_type: "commit",
        requested_reference: SHA,
        resolved_sha: SHA
      },

      claims: [
        {
          claim_id: "C1",
          statement:
            "Tests executed successfully.",
          criticality: "REQUIRED",
          status: "SUPPORTED",
          evidence_refs: ["E1"]
        },
        {
          claim_id: "C2",
          statement:
            "Workflow configuration exists.",
          criticality: "SUPPORTING",
          status: "SUPPORTED",
          evidence_refs: ["E2"]
        }
      ],

      evidence: [
        {
          evidence_id: "E1",
          source_type: "LOG",
          repository: "example/project",
          target_sha: SHA,
          locator: "run/1/job/1",
          observation: "2 passed",
          level: "OUTPUT_OBSERVED"
        },
        {
          evidence_id: "E2",
          source_type: "WORKFLOW",
          repository: "example/project",
          target_sha: SHA,
          locator: ".github/workflows/ci.yml",
          observation:
            "Workflow configuration retrieved.",
          level: "CONFIGURED"
        }
      ]
    },
    {
      requireEvidenceProtocol: true
    }
  );
}

function guard(
  overrides = {}
) {
  return {
    verdict: "PASS",
    worker_decision_supported: true,

    evidence_coverage: 0.95,
    claim_accuracy: 0.95,
    risk: "LOW",

    target_resolution: {
      status: "RESOLVED",
      requested_type: "commit",
      requested_reference: SHA,
      resolved_sha: SHA
    },

    verified_claims: [
      "C1",
      "C2"
    ],

    unverified_claims: [],
    contradicted_claims: [],

    findings: [],
    requested_checks: [],

    allowed_to_act: true,
    retry_recommended: false,

    summary:
      "Required Worker claims were independently verified.",

    ...overrides
  };
}

function validate(
  report
) {
  return validateGuardReport(
    report,
    {
      workerReport:
        worker(),

      requireEvidenceProtocol:
        true
    }
  );
}

test(
  "accepts complete Guard classification of Worker claims",
  () => {
    const result =
      validate(
        guard()
      );

    assert.deepEqual(
      result.verified_claims,
      ["C1", "C2"]
    );
  }
);

test(
  "rejects missing Guard classification arrays in strict mode",
  () => {
    const report =
      guard();

    delete report.verified_claims;

    assert.throws(
      () =>
        validate(report),
      /are required for runtime verification/
    );
  }
);

test(
  "rejects unknown Worker claim id",
  () => {
    assert.throws(
      () =>
        validate(
          guard({
            verified_claims: [
              "C1",
              "C404"
            ]
          })
        ),
      /unknown Worker claim_id/
    );
  }
);

test(
  "rejects Worker claim appearing in multiple classifications",
  () => {
    assert.throws(
      () =>
        validate(
          guard({
            verified_claims: [
              "C1",
              "C2"
            ],

            unverified_claims: [
              "C1"
            ]
          })
        ),
      /appears in more than one Guard classification/
    );
  }
);

test(
  "rejects unclassified Worker claim",
  () => {
    assert.throws(
      () =>
        validate(
          guard({
            verified_claims: [
              "C1"
            ]
          })
        ),
      /did not classify Worker claim_id: C2/
    );
  }
);

test(
  "rejects finding referencing unknown Worker claim",
  () => {
    assert.throws(
      () =>
        validate(
          guard({
            verdict: "REVIEW",
            worker_decision_supported:
              false,
            allowed_to_act:
              false,
            retry_recommended:
              true,

            verified_claims:
              ["C2"],

            unverified_claims:
              ["C1"],

            findings: [
              {
                id: "F1",
                type:
                  "MISSING_EVIDENCE",
                severity:
                  "MEDIUM",
                claim_id:
                  "C404",
                description:
                  "Required evidence is missing.",
                verified_evidence:
                  [],
                required_check:
                  "Retrieve required execution evidence."
              }
            ],

            requested_checks: [
              {
                finding_id:
                  "F1",
                check:
                  "Retrieve required execution evidence."
              }
            ]
          })
        ),
      /claim_id references unknown Worker claim_id/
    );
  }
);

test(
  "rejects finding referencing unknown Worker evidence",
  () => {
    assert.throws(
      () =>
        validate(
          guard({
            verdict: "REVIEW",
            worker_decision_supported:
              false,
            allowed_to_act:
              false,
            retry_recommended:
              true,

            verified_claims:
              ["C2"],

            unverified_claims:
              ["C1"],

            findings: [
              {
                id: "F1",
                type:
                  "MISSING_EVIDENCE",
                severity:
                  "MEDIUM",
                claim_id:
                  "C1",
                description:
                  "Execution evidence is insufficient.",
                verified_evidence:
                  ["E404"],
                required_check:
                  "Retrieve the execution log."
              }
            ],

            requested_checks: [
              {
                finding_id:
                  "F1",
                check:
                  "Retrieve the execution log."
              }
            ]
          })
        ),
      /verified_evidence references unknown Worker evidence_id/
    );
  }
);

test(
  "rejects PASS containing contradicted Worker claim",
  () => {
    assert.throws(
      () =>
        validate(
          guard({
            verified_claims:
              ["C2"],

            unverified_claims:
              [],

            contradicted_claims:
              ["C1"]
          })
        ),
      /PASS cannot contain contradicted Worker claims/
    );
  }
);

test(
  "rejects READY PASS when required claim is not independently verified",
  () => {
    assert.throws(
      () =>
        validate(
          guard({
            verified_claims:
              ["C2"],

            unverified_claims:
              ["C1"],

            contradicted_claims:
              []
          })
        ),
      /READY \+ PASS requires REQUIRED Worker claim C1/
    );
  }
);

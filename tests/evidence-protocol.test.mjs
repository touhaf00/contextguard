import assert from "node:assert/strict";
import test from "node:test";

import {
  validateWorkerReport
} from "../dist/lib/validate-report.js";

const SHA =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function baseWorker(
  overrides = {}
) {
  return {
    decision:
      "READY",

    confidence:
      0.9,

    summary:
      "Evidence supports technical readiness.",

    target_resolution: {
      status:
        "RESOLVED",

      requested_type:
        "commit",

      requested_reference:
        SHA,

      resolved_sha:
        SHA
    },

    claims: [
      {
        claim_id:
          "C1",

        statement:
          "Required tests executed successfully.",

        criticality:
          "REQUIRED",

        status:
          "SUPPORTED",

        evidence_refs:
          ["E1"]
      }
    ],

    evidence: [
      {
        evidence_id:
          "E1",

        source_type:
          "LOG",

        repository:
          "example/project",

        target_sha:
          SHA,

        locator:
          "workflow-run/123/job/456",

        observation:
          "pytest reported 2 passed.",

        level:
          "OUTPUT_OBSERVED"
      }
    ],

    ...overrides
  };
}

test(
  "accepts a valid typed evidence protocol",
  () => {
    const report =
      validateWorkerReport(
        baseWorker()
      );

    assert.equal(
      report.claims[0].claim_id,
      "C1"
    );

    assert.equal(
      report.evidence[0].evidence_id,
      "E1"
    );
  }
);

test(
  "keeps backward compatibility when protocol is absent",
  () => {
    const report =
      baseWorker();

    delete report.claims;
    delete report.evidence;

    assert.doesNotThrow(
      () =>
        validateWorkerReport(
          report
        )
    );
  }
);

test(
  "requires claims and evidence together",
  () => {
    const report =
      baseWorker();

    delete report.evidence;

    assert.throws(
      () =>
        validateWorkerReport(
          report
        ),
      /must be provided together/
    );
  }
);

test(
  "rejects duplicate evidence ids",
  () => {
    const report =
      baseWorker({
        evidence: [
          baseWorker().evidence[0],
          baseWorker().evidence[0]
        ]
      });

    assert.throws(
      () =>
        validateWorkerReport(
          report
        ),
      /duplicate evidence_id/
    );
  }
);

test(
  "rejects duplicate claim ids",
  () => {
    const claim =
      baseWorker().claims[0];

    const report =
      baseWorker({
        claims: [
          claim,
          claim
        ]
      });

    assert.throws(
      () =>
        validateWorkerReport(
          report
        ),
      /duplicate claim_id/
    );
  }
);

test(
  "rejects evidence from another target SHA",
  () => {
    const report =
      baseWorker({
        evidence: [
          {
            ...baseWorker().evidence[0],

            target_sha:
              "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
          }
        ]
      });

    assert.throws(
      () =>
        validateWorkerReport(
          report
        ),
      /must match WorkerReport.target_resolution.resolved_sha/
    );
  }
);

test(
  "rejects claim reference to unknown evidence",
  () => {
    const report =
      baseWorker({
        claims: [
          {
            ...baseWorker().claims[0],

            evidence_refs:
              ["E404"]
          }
        ]
      });

    assert.throws(
      () =>
        validateWorkerReport(
          report
        ),
      /unknown evidence_id/
    );
  }
);

test(
  "requires evidence for a supported claim",
  () => {
    const report =
      baseWorker({
        claims: [
          {
            ...baseWorker().claims[0],

            evidence_refs:
              []
          }
        ]
      });

    assert.throws(
      () =>
        validateWorkerReport(
          report
        ),
      /requires at least one evidence reference/
    );
  }
);

test(
  "rejects READY with unresolved required claim",
  () => {
    const report =
      baseWorker({
        claims: [
          {
            ...baseWorker().claims[0],

            status:
              "UNKNOWN",

            evidence_refs:
              []
          }
        ]
      });

    assert.throws(
      () =>
        validateWorkerReport(
          report
        ),
      /READY requires every REQUIRED claim to be SUPPORTED/
    );
  }
);

test(
  "allows UNKNOWN with unresolved required claim",
  () => {
    const report =
      baseWorker({
        decision:
          "UNKNOWN",

        claims: [
          {
            ...baseWorker().claims[0],

            status:
              "UNKNOWN",

            evidence_refs:
              []
          }
        ]
      });

    assert.doesNotThrow(
      () =>
        validateWorkerReport(
          report
        )
    );
  }
);

import assert from "node:assert/strict";
import test from "node:test";

import {
  actionLockMatchesResult,
  assessmentDigest,
  createActionLock,
  fingerprintActionIntent,
  verifyActionLock
} from "../dist/lib/action-integrity.js";

const SHA =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function result(
  overrides = {}
) {
  const base = {
    repository:
      "example/project",

    target: {
      type:
        "commit",

      reference:
        SHA
    },

    target_integrity: {
      status:
        "VERIFIED",

      worker: {
        status:
          "RESOLVED",

        requested_type:
          "commit",

        requested_reference:
          SHA,

        resolved_sha:
          SHA
      },

      guard: {
        status:
          "RESOLVED",

        requested_type:
          "commit",

        requested_reference:
          SHA,

        resolved_sha:
          SHA
      },

      locked_sha:
        SHA
    },

    worker: {
      decision:
        "READY",

      confidence:
        0.9,

      summary:
        "Ready.",

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
            "Tests passed.",

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
            "run/1/job/1",

          observation:
            "2 passed",

          level:
            "OUTPUT_OBSERVED"
        }
      ]
    },

    guard: {
      verdict:
        "PASS",

      evidence_coverage:
        1,

      claim_accuracy:
        1,

      risk:
        "LOW",

      findings:
        [],

      requested_checks:
        [],

      verified_claims:
        ["C1"],

      unverified_claims:
        [],

      contradicted_claims:
        [],

      worker_decision_supported:
        true,

      allowed_to_act:
        true,

      retry_recommended:
        false,

      summary:
        "Verified.",

      target_resolution: {
        status:
          "RESOLVED",

        requested_type:
          "commit",

        requested_reference:
          SHA,

        resolved_sha:
          SHA
      }
    },

    retry_count:
      0,

    max_retries:
      2,

    status:
      "AWAITING_HUMAN_APPROVAL",

    external_action_executed:
      false,

    human_approval_required:
      true
  };

  return {
    ...base,
    ...overrides
  };
}

const FIXED = {
  intentId:
    "intent-test-1",

  approvalId:
    "approval-test-1",

  createdAt:
    "2026-10-31T01:00:00.000Z"
};

test(
  "creates a pending ActionLock only for an approved safety state",
  () => {
    const lock =
      createActionLock(
        result(),
        FIXED
      );

    assert.equal(
      lock.status,
      "PENDING"
    );

    assert.equal(
      lock.intent.locked_sha,
      SHA
    );

    assert.equal(
      lock.intent.action_type,
      "PROCEED_TO_NEXT_STAGE"
    );
  }
);

test(
  "produces a stable fingerprint for the same ActionIntent",
  () => {
    const lock =
      createActionLock(
        result(),
        FIXED
      );

    assert.equal(
      fingerprintActionIntent(
        lock.intent
      ),
      lock.fingerprint
    );
  }
);

test(
  "detects ActionIntent tampering",
  () => {
    const lock =
      createActionLock(
        result(),
        FIXED
      );

    lock.intent.repository =
      "attacker/other-repository";

    assert.equal(
      verifyActionLock(lock),
      false
    );
  }
);

test(
  "rejects ActionIntent creation before human approval state",
  () => {
    assert.throws(
      () =>
        createActionLock(
          result({
            status:
              "STOPPED_UNKNOWN"
          }),
          FIXED
        ),
      /AWAITING_HUMAN_APPROVAL/
    );
  }
);

test(
  "rejects ActionIntent when Worker is not READY",
  () => {
    const value =
      result();

    value.worker.decision =
      "UNKNOWN";

    assert.throws(
      () =>
        createActionLock(
          value,
          FIXED
        ),
      /Worker decision READY/
    );
  }
);

test(
  "rejects ActionIntent when Guard is not PASS",
  () => {
    const value =
      result();

    value.guard.verdict =
      "REVIEW";

    assert.throws(
      () =>
        createActionLock(
          value,
          FIXED
        ),
      /Guard verdict PASS/
    );
  }
);

test(
  "rejects ActionIntent without verified target integrity",
  () => {
    const value =
      result();

    value.target_integrity.status =
      "SHA_MISMATCH";

    assert.throws(
      () =>
        createActionLock(
          value,
          FIXED
        ),
      /VERIFIED target integrity/
    );
  }
);

test(
  "binds approval fingerprint to the evidence snapshot",
  () => {
    const original =
      result();

    const lock =
      createActionLock(
        original,
        FIXED
      );

    const modified =
      result();

    modified.worker.evidence[0]
      .observation =
        "different output";

    assert.notEqual(
      assessmentDigest(original),
      assessmentDigest(modified)
    );

    assert.equal(
      actionLockMatchesResult(
        lock,
        modified
      ),
      false
    );
  }
);

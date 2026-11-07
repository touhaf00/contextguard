import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDemoResult
} from "../dist/demo.js";

import {
  actionLockMatchesResult,
  createActionLock
} from "../dist/lib/action-integrity.js";

import {
  ApprovalStoreError
} from "../dist/lib/approval-store.js";

import {
  AuditCoordinator
} from "../dist/lib/audit-coordinator.js";

import {
  verifyAuditCheckpoint
} from "../dist/lib/audit-trail.js";

import {
  validateWorkerEvidenceProtocol
} from "../dist/lib/evidence-protocol.js";

import {
  evaluateTargetIntegrity
} from "../dist/lib/target-integrity.js";

const LOCKED_SHA =
  "b182a69150a65b60217ef9758b1fd771f64e7d1a";

const DRIFT_SHA =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

function ready() {
  return clone(
    buildDemoResult(
      "ready_pass"
    )
  );
}

function mission() {
  return {
    repository:
      "touhaf00/tp-cicd",

    target: {
      type:
        "tag",

      reference:
        "v1.1.0"
    },

    mission:
      "Assess release readiness.",

    constraints: {
      read_only:
        true
    }
  };
}

function resolution(
  sha = LOCKED_SHA
) {
  return {
    status:
      "RESOLVED",

    requested_type:
      "tag",

    requested_reference:
      "v1.1.0",

    resolved_sha:
      sha
  };
}

function evidenceReport() {
  return {
    claims: [
      {
        claim_id:
          "C1",

        statement:
          "The required tests passed.",

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
          "touhaf00/tp-cicd",

        target_sha:
          LOCKED_SHA,

        locator:
          "actions/run/37930694308/test",

        observation:
          "2 passed",

        level:
          "OUTPUT_OBSERVED"
      }
    ]
  };
}

test(
  "eval: coordinated target drift after lock is blocked",
  () => {
    const integrity =
      evaluateTargetIntegrity(
        mission(),
        resolution(
          DRIFT_SHA
        ),
        resolution(
          DRIFT_SHA
        ),
        LOCKED_SHA
      );

    assert.equal(
      integrity.status,
      "SHA_MISMATCH"
    );

    assert.equal(
      integrity.locked_sha,
      undefined
    );
  }
);

test(
  "eval: Worker and Guard resolving different SHAs is blocked",
  () => {
    const integrity =
      evaluateTargetIntegrity(
        mission(),
        resolution(
          LOCKED_SHA
        ),
        resolution(
          DRIFT_SHA
        )
      );

    assert.equal(
      integrity.status,
      "SHA_MISMATCH"
    );
  }
);

test(
  "eval: cross-repository evidence spoofing is rejected",
  () => {
    const report =
      evidenceReport();

    report.evidence[0]
      .repository =
        "attacker/other-repo";

    assert.throws(
      () =>
        validateWorkerEvidenceProtocol(
          report,
          resolution(),
          "READY",
          {
            expectedRepository:
              "touhaf00/tp-cicd"
          }
        ),
      /repository must match the assessed repository/
    );
  }
);

test(
  "eval: stale-target evidence spoofing is rejected",
  () => {
    const report =
      evidenceReport();

    report.evidence[0]
      .target_sha =
        DRIFT_SHA;

    assert.throws(
      () =>
        validateWorkerEvidenceProtocol(
          report,
          resolution(),
          "READY",
          {
            expectedRepository:
              "touhaf00/tp-cicd"
          }
        ),
      /target_sha must match WorkerReport.target_resolution.resolved_sha/
    );
  }
);

test(
  "eval: false READY with unresolved REQUIRED claim is rejected",
  () => {
    const report =
      evidenceReport();

    report.claims[0]
      .status =
        "UNKNOWN";

    report.claims[0]
      .evidence_refs =
        [];

    assert.throws(
      () =>
        validateWorkerEvidenceProtocol(
          report,
          resolution(),
          "READY",
          {
            expectedRepository:
              "touhaf00/tp-cicd"
          }
        ),
      /READY requires every REQUIRED claim to be SUPPORTED/
    );
  }
);

test(
  "eval: forged approval fingerprint is blocked and audited",
  () => {
    const audit =
      new AuditCoordinator();

    const result =
      audit.completeAssessment(
        ready(),
        "eval-forged-fingerprint"
      );

    assert.throws(
      () =>
        audit.approve(
          result.approval
            .approval_id,

          "f".repeat(64)
        ),
      (error) =>
        error instanceof
          ApprovalStoreError &&
        error.code ===
          "FINGERPRINT_MISMATCH"
    );

    const last =
      audit.snapshot()
        .at(-1);

    assert.equal(
      last.event_type,
      "APPROVAL_REJECTED"
    );

    assert.equal(
      last.payload.code,
      "FINGERPRINT_MISMATCH"
    );
  }
);

test(
  "eval: approval replay is rejected and audited",
  () => {
    const audit =
      new AuditCoordinator();

    const result =
      audit.completeAssessment(
        ready(),
        "eval-replay"
      );

    const approval =
      audit.approve(
        result.approval
          .approval_id,

        result.approval
          .fingerprint
      );

    assert.throws(
      () =>
        audit.approve(
          approval.approval_id,
          approval.fingerprint
        ),
      (error) =>
        error instanceof
          ApprovalStoreError &&
        error.code ===
          "ALREADY_APPROVED"
    );

    const last =
      audit.snapshot()
        .at(-1);

    assert.equal(
      last.event_type,
      "APPROVAL_REJECTED"
    );

    assert.equal(
      last.payload.code,
      "ALREADY_APPROVED"
    );
  }
);

test(
  "eval: preflight before human approval is blocked and audited",
  () => {
    const audit =
      new AuditCoordinator();

    const result =
      audit.completeAssessment(
        ready(),
        "eval-no-approval"
      );

    assert.throws(
      () =>
        audit.preflight(
          result.approval
            .approval_id,

          result.approval
            .fingerprint,

          result.approval
            .intent
            .locked_sha
        ),
      (error) =>
        error instanceof
          ApprovalStoreError &&
        error.code ===
          "NOT_APPROVED"
    );

    const last =
      audit.snapshot()
        .at(-1);

    assert.equal(
      last.event_type,
      "PREFLIGHT_BLOCKED"
    );

    assert.equal(
      last.payload.code,
      "NOT_APPROVED"
    );
  }
);

test(
  "eval: post-approval target drift is blocked and audited",
  () => {
    const audit =
      new AuditCoordinator();

    const result =
      audit.completeAssessment(
        ready(),
        "eval-target-drift"
      );

    const approval =
      audit.approve(
        result.approval
          .approval_id,

        result.approval
          .fingerprint
      );

    assert.throws(
      () =>
        audit.preflight(
          approval.approval_id,
          approval.fingerprint,
          DRIFT_SHA
        ),
      (error) =>
        error instanceof
          ApprovalStoreError &&
        error.code ===
          "TARGET_CHANGED"
    );

    const last =
      audit.snapshot()
        .at(-1);

    assert.equal(
      last.event_type,
      "PREFLIGHT_BLOCKED"
    );

    assert.equal(
      last.payload.code,
      "TARGET_CHANGED"
    );
  }
);

test(
  "eval: changing the approved action snapshot invalidates its lock",
  () => {
    const original =
      ready();

    const lock =
      createActionLock(
        original,
        {
          approvalId:
            "eval-approval",

          intentId:
            "eval-intent",

          createdAt:
            "2026-10-31T01:00:00.000Z"
        }
      );

    const modified =
      ready();

    modified.target.reference =
      "v9.9.9";

    assert.equal(
      actionLockMatchesResult(
        lock,
        modified
      ),
      false
    );
  }
);

test(
  "eval: UNKNOWN assessment cannot create an actionable lock",
  () => {
    const unknown =
      clone(
        buildDemoResult(
          "unknown_pass"
        )
      );

    assert.throws(
      () =>
        createActionLock(
          unknown
        ),
      /AWAITING_HUMAN_APPROVAL/
    );
  }
);

test(
  "eval: audit tail truncation is detected against the issued checkpoint",
  () => {
    const audit =
      new AuditCoordinator();

    const result =
      audit.completeAssessment(
        ready(),
        "eval-audit-truncation"
      );

    const events =
      audit.snapshot();

    assert.equal(
      verifyAuditCheckpoint(
        events,
        result.audit_checkpoint
      ),
      true
    );

    events.pop();

    assert.equal(
      verifyAuditCheckpoint(
        events,
        result.audit_checkpoint
      ),
      false
    );
  }
);

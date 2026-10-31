import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDemoResult
} from "../dist/demo.js";

import {
  ApprovalStore,
  ApprovalStoreError
} from "../dist/lib/approval-store.js";

import {
  AuditCoordinator
} from "../dist/lib/audit-coordinator.js";

import {
  AuditTrail,
  verifyAuditCheckpoint
} from "../dist/lib/audit-trail.js";

function coordinator() {
  const approvalStore =
    new ApprovalStore();

  const auditTrail =
    new AuditTrail();

  return {
    audit:
      new AuditCoordinator(
        approvalStore,
        auditTrail
      ),

    auditTrail
  };
}

test(
  "records assessment then action lock in order",
  () => {
    const {
      audit
    } = coordinator();

    const result =
      audit.completeAssessment(
        buildDemoResult(
          "ready_pass"
        ),
        "assessment-1"
      );

    const events =
      audit.snapshot();

    assert.equal(
      events.length,
      2
    );

    assert.equal(
      events[0].event_type,
      "ASSESSMENT_COMPLETED"
    );

    assert.equal(
      events[0].subject_id,
      "assessment-1"
    );

    assert.equal(
      events[1].event_type,
      "ACTION_LOCK_CREATED"
    );

    assert.equal(
      events[1].subject_id,
      result.approval
        .approval_id
    );

    assert.equal(
      verifyAuditCheckpoint(
        events,
        result.audit_checkpoint
      ),
      true
    );
  }
);

test(
  "records only assessment when no human approval is available",
  () => {
    const {
      audit
    } = coordinator();

    const result =
      audit.completeAssessment(
        buildDemoResult(
          "review"
        ),
        "assessment-review"
      );

    const events =
      audit.snapshot();

    assert.equal(
      events.length,
      1
    );

    assert.equal(
      events[0].event_type,
      "ASSESSMENT_COMPLETED"
    );

    assert.equal(
      result.approval,
      undefined
    );
  }
);

test(
  "records successful human approval",
  () => {
    const {
      audit
    } = coordinator();

    const result =
      audit.completeAssessment(
        buildDemoResult(
          "ready_pass"
        ),
        "assessment-1"
      );

    audit.approve(
      result.approval
        .approval_id,

      result.approval
        .fingerprint
    );

    const events =
      audit.snapshot();

    assert.equal(
      events.at(-1)
        .event_type,
      "APPROVAL_GRANTED"
    );

    assert.equal(
      audit.verify(),
      true
    );
  }
);

test(
  "records rejected human approval",
  () => {
    const {
      audit
    } = coordinator();

    const result =
      audit.completeAssessment(
        buildDemoResult(
          "ready_pass"
        ),
        "assessment-1"
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
  "records verified preflight",
  () => {
    const {
      audit
    } = coordinator();

    const result =
      audit.completeAssessment(
        buildDemoResult(
          "ready_pass"
        ),
        "assessment-1"
      );

    const approval =
      audit.approve(
        result.approval
          .approval_id,

        result.approval
          .fingerprint
      );

    audit.preflight(
      approval.approval_id,
      approval.fingerprint,
      approval.intent.locked_sha
    );

    const last =
      audit.snapshot()
        .at(-1);

    assert.equal(
      last.event_type,
      "PREFLIGHT_VERIFIED"
    );

    assert.equal(
      audit.verify(),
      true
    );
  }
);

test(
  "records blocked preflight on post-approval target drift",
  () => {
    const {
      audit
    } = coordinator();

    const result =
      audit.completeAssessment(
        buildDemoResult(
          "ready_pass"
        ),
        "assessment-1"
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
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
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

    assert.equal(
      audit.verify(),
      true
    );
  }
);

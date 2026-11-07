import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDemoResult
} from "../dist/demo.js";

import {
  ApprovalStoreError
} from "../dist/lib/approval-store.js";

import {
  AuditCoordinator
} from "../dist/lib/audit-coordinator.js";

test(
  "demo approval cannot be used in the live coordinator",
  () => {
    const demo =
      new AuditCoordinator();

    const live =
      new AuditCoordinator();

    const result =
      demo.completeAssessment(
        buildDemoResult(
          "ready_pass"
        ),
        "demo-assessment"
      );

    assert.ok(
      result.approval
    );

    assert.throws(
      () =>
        live.approve(
          result.approval
            .approval_id,

          result.approval
            .fingerprint
        ),
      (error) =>
        error instanceof
          ApprovalStoreError &&
        error.code ===
          "NOT_FOUND"
    );
  }
);

test(
  "live approval cannot be used in the demo coordinator",
  () => {
    const demo =
      new AuditCoordinator();

    const live =
      new AuditCoordinator();

    const result =
      live.completeAssessment(
        buildDemoResult(
          "ready_pass"
        ),
        "live-assessment"
      );

    assert.ok(
      result.approval
    );

    assert.throws(
      () =>
        demo.approve(
          result.approval
            .approval_id,

          result.approval
            .fingerprint
        ),
      (error) =>
        error instanceof
          ApprovalStoreError &&
        error.code ===
          "NOT_FOUND"
    );
  }
);

test(
  "demo and live audit ledgers evolve independently",
  () => {
    const demo =
      new AuditCoordinator();

    const live =
      new AuditCoordinator();

    const demoResult =
      demo.completeAssessment(
        buildDemoResult(
          "ready_pass"
        ),
        "demo-assessment"
      );

    live.completeAssessment(
      buildDemoResult(
        "unknown_pass"
      ),
      "live-assessment"
    );

    assert.equal(
      demo.checkpoint()
        .event_count,
      2
    );

    assert.equal(
      live.checkpoint()
        .event_count,
      1
    );

    assert.ok(
      demoResult.approval
    );

    demo.approve(
      demoResult.approval
        .approval_id,

      demoResult.approval
        .fingerprint
    );

    assert.equal(
      demo.checkpoint()
        .event_count,
      3
    );

    assert.equal(
      live.checkpoint()
        .event_count,
      1
    );
  }
);

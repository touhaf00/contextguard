import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDemoResult
} from "../dist/demo.js";

import {
  ApprovalStore,
  ApprovalStoreError
} from "../dist/lib/approval-store.js";

function ready() {
  return buildDemoResult(
    "ready_pass"
  );
}

test(
  "creates a pending server-side approval",
  () => {
    const store =
      new ApprovalStore(
        60_000,
        10,
        () => 1_000
      );

    const approval =
      store.create(
        ready()
      );

    assert.equal(
      approval.status,
      "PENDING"
    );

    assert.equal(
      approval.intent.locked_sha,
      "b182a69150a65b60217ef9758b1fd771f64e7d1a"
    );

    assert.equal(
      approval.external_action_executed,
      false
    );

    assert.equal(
      approval.execution_configured,
      false
    );
  }
);

test(
  "approves an exact pending fingerprint",
  () => {
    let now = 1_000;

    const store =
      new ApprovalStore(
        60_000,
        10,
        () => now
      );

    const pending =
      store.create(
        ready()
      );

    now = 2_000;

    const approved =
      store.approve(
        pending.approval_id,
        pending.fingerprint
      );

    assert.equal(
      approved.status,
      "APPROVED"
    );

    assert.equal(
      approved.external_action_executed,
      false
    );

    assert.ok(
      approved.approved_at
    );
  }
);

test(
  "rejects an unknown approval id",
  () => {
    const store =
      new ApprovalStore();

    assert.throws(
      () =>
        store.approve(
          "missing",
          "a".repeat(64)
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
  "rejects a fingerprint mismatch",
  () => {
    const store =
      new ApprovalStore();

    const pending =
      store.create(
        ready()
      );

    assert.throws(
      () =>
        store.approve(
          pending.approval_id,
          "a".repeat(64)
        ),
      (error) =>
        error instanceof
          ApprovalStoreError &&
        error.code ===
          "FINGERPRINT_MISMATCH"
    );
  }
);

test(
  "rejects duplicate approval",
  () => {
    const store =
      new ApprovalStore();

    const pending =
      store.create(
        ready()
      );

    store.approve(
      pending.approval_id,
      pending.fingerprint
    );

    assert.throws(
      () =>
        store.approve(
          pending.approval_id,
          pending.fingerprint
        ),
      (error) =>
        error instanceof
          ApprovalStoreError &&
        error.code ===
          "ALREADY_APPROVED"
    );
  }
);

test(
  "rejects an expired approval",
  () => {
    let now = 1_000;

    const store =
      new ApprovalStore(
        100,
        10,
        () => now
      );

    const pending =
      store.create(
        ready()
      );

    now = 1_101;

    assert.throws(
      () =>
        store.approve(
          pending.approval_id,
          pending.fingerprint
        ),
      (error) =>
        error instanceof
          ApprovalStoreError &&
        error.code ===
          "EXPIRED"
    );
  }
);

test(
  "stores an immutable assessment snapshot",
  () => {
    const store =
      new ApprovalStore();

    const assessment =
      ready();

    const pending =
      store.create(
        assessment
      );

    assessment.repository =
      "attacker/changed";

    const approved =
      store.approve(
        pending.approval_id,
        pending.fingerprint
      );

    assert.equal(
      approved.status,
      "APPROVED"
    );

    assert.equal(
      approved.intent.repository,
      "touhaf00/tp-cicd"
    );
  }
);

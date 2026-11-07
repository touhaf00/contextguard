import assert from "node:assert/strict";
import test from "node:test";

import {
  digestCanonicalJson
} from "../dist/core/authorization-integrity.js";

import {
  ExecutionAuthorizationReceiptStoreV2,
  ExecutionReceiptStoreErrorV2
} from "../dist/api/v2/execution-receipt-store.js";

function receipt({
  receiptId =
    "receipt-store-1",

  lockFingerprint =
    "a".repeat(64),

  expiresAt =
    "2026-11-02T02:20:00Z"
} = {}) {
  const proposedAction = {
    namespace:
      "github",

    action:
      "deploy_release",

    parameters: {
      environment:
        "production",

      target_ref:
        "main"
    }
  };

  const base = {
    receipt_version:
      "2",

    receipt_id:
      receiptId,

    session_id:
      "session-store-1",

    request_id:
      "request-store-1",

    lock_id:
      "lock-store-1",

    lock_fingerprint:
      lockFingerprint,

    status:
      "AUTHORIZED_FOR_EXECUTOR",

    subject: {
      provider:
        "github",

      resource_type:
        "repository_ref",

      resource_id:
        "touhaf00/contextguard",

      selector: {
        kind:
          "branch",

        ref:
          "main"
      }
    },

    snapshot_id:
      "github:touhaf00/contextguard@state-v1",

    authorized_snapshot_version:
      "state-v1",

    proposed_action:
      proposedAction,

    action_digest:
      digestCanonicalJson(
        proposedAction
      ),

    policy_digest:
      "b".repeat(64),

    runtime_digest:
      "c".repeat(64),

    approval_requirement:
      "REQUIRED",

    approval_id:
      "approval-store-1",

    approval_principal_id:
      "operator-store",

    approval_record_digest:
      "d".repeat(64),

    approval_attestation_digest:
      "e".repeat(64),

    preflight_checked_at:
      "2026-11-02T02:10:00Z",

    preflight_response_digest:
      "f".repeat(64),

    issued_at:
      "2026-11-02T02:10:30Z",

    expires_at:
      expiresAt,

    execution_configured:
      false,

    external_action_executed:
      false
  };

  return {
    ...base,

    receipt_digest:
      digestCanonicalJson(
        base
      )
  };
}

function expectCode(
  fn,
  code
) {
  assert.throws(
    fn,
    (error) =>
      error instanceof
        ExecutionReceiptStoreErrorV2 &&
      error.code ===
        code
  );
}

test(
  "execution receipt store records a detached available receipt",
  () => {
    const store =
      new ExecutionAuthorizationReceiptStoreV2();

    const original =
      receipt();

    const stored =
      store.record(
        original,
        {
          storedAt:
            "2026-11-02T02:11:00Z"
        }
      );

    original.proposed_action
      .parameters
      .environment =
      "attacker";

    const loaded =
      store.get(
        stored.receipt_id
      );

    assert.equal(
      loaded.state,
      "AVAILABLE"
    );

    assert.equal(
      loaded.receipt
        .proposed_action
        .parameters
        .environment,
      "production"
    );

    assert.equal(
      store.size(),
      1
    );
  }
);

test(
  "execution receipt is consumed exactly once",
  () => {
    const store =
      new ExecutionAuthorizationReceiptStoreV2();

    const authorization =
      receipt();

    store.record(
      authorization,
      {
        storedAt:
          "2026-11-02T02:11:00Z"
      }
    );

    const consumption =
      store.consume(
        authorization.receipt_id,
        authorization.receipt_digest,
        {
          consumedAt:
            "2026-11-02T02:12:00Z",

          consumptionId:
            "consumption-1"
        }
      );

    assert.equal(
      consumption.status,
      "CONSUMED_FOR_EXECUTION"
    );

    assert.equal(
      consumption.consumption_id,
      "consumption-1"
    );

    assert.equal(
      consumption.external_action_executed,
      false
    );

    assert.equal(
      store.get(
        authorization.receipt_id
      ).state,
      "CONSUMED"
    );
  }
);

test(
  "consumed execution receipt cannot be replayed",
  () => {
    const store =
      new ExecutionAuthorizationReceiptStoreV2();

    const authorization =
      receipt();

    store.record(
      authorization,
      {
        storedAt:
          "2026-11-02T02:11:00Z"
      }
    );

    store.consume(
      authorization.receipt_id,
      authorization.receipt_digest,
      {
        consumedAt:
          "2026-11-02T02:12:00Z"
      }
    );

    expectCode(
      () =>
        store.consume(
          authorization.receipt_id,
          authorization.receipt_digest,
          {
            consumedAt:
              "2026-11-02T02:13:00Z"
          }
        ),
      "ALREADY_CONSUMED"
    );
  }
);

test(
  "executor must present the exact receipt digest",
  () => {
    const store =
      new ExecutionAuthorizationReceiptStoreV2();

    const authorization =
      receipt();

    store.record(
      authorization,
      {
        storedAt:
          "2026-11-02T02:11:00Z"
      }
    );

    expectCode(
      () =>
        store.consume(
          authorization.receipt_id,
          "9".repeat(64),
          {
            consumedAt:
              "2026-11-02T02:12:00Z"
          }
        ),
      "DIGEST_MISMATCH"
    );

    assert.equal(
      store.get(
        authorization.receipt_id
      ).state,
      "AVAILABLE"
    );
  }
);

test(
  "expired receipt cannot be consumed",
  () => {
    const store =
      new ExecutionAuthorizationReceiptStoreV2();

    const authorization =
      receipt({
        expiresAt:
          "2026-11-02T02:12:30Z"
      });

    store.record(
      authorization,
      {
        storedAt:
          "2026-11-02T02:11:00Z"
      }
    );

    expectCode(
      () =>
        store.consume(
          authorization.receipt_id,
          authorization.receipt_digest,
          {
            consumedAt:
              "2026-11-02T02:12:30Z"
          }
        ),
      "EXPIRED"
    );
  }
);

test(
  "same receipt id cannot be stored twice",
  () => {
    const store =
      new ExecutionAuthorizationReceiptStoreV2();

    const authorization =
      receipt();

    store.record(
      authorization,
      {
        storedAt:
          "2026-11-02T02:11:00Z"
      }
    );

    expectCode(
      () =>
        store.record(
          authorization,
          {
            storedAt:
              "2026-11-02T02:11:30Z"
          }
        ),
      "DUPLICATE_RECEIPT"
    );
  }
);

test(
  "different receipt ids cannot authorize the same ActionLock twice",
  () => {
    const store =
      new ExecutionAuthorizationReceiptStoreV2();

    const first =
      receipt({
        receiptId:
          "receipt-lock-1"
      });

    const second =
      receipt({
        receiptId:
          "receipt-lock-2"
      });

    store.record(
      first,
      {
        storedAt:
          "2026-11-02T02:11:00Z"
      }
    );

    expectCode(
      () =>
        store.record(
          second,
          {
            storedAt:
              "2026-11-02T02:11:30Z"
          }
        ),
      "DUPLICATE_LOCK"
    );
  }
);

test(
  "tampered receipt is rejected before storage",
  () => {
    const store =
      new ExecutionAuthorizationReceiptStoreV2();

    const authorization =
      receipt();

    authorization.proposed_action
      .parameters
      .environment =
      "attacker";

    expectCode(
      () =>
        store.record(
          authorization,
          {
            storedAt:
              "2026-11-02T02:11:00Z"
          }
        ),
      "INVALID_RECEIPT"
    );

    assert.equal(
      store.size(),
      0
    );
  }
);

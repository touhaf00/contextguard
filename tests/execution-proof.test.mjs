import assert from "node:assert/strict";
import test from "node:test";

import {
  createExecutionProofV2,
  verifyExecutionProofIntegrityV2,
  ExecutionProofErrorV2
} from "../dist/api/v2/execution-proof.js";

import {
  ExecutionProofStoreV2,
  ExecutionProofStoreErrorV2
} from "../dist/api/v2/execution-proof-store.js";

const SHA =
  "98cea7e90815c68462d93c2e2e092d7068b1c65d";

function input() {
  return {
    receipt_id:
      "receipt-1",

    receipt_digest:
      "a".repeat(64),

    consumption_id:
      "consumption-1",

    consumption_digest:
      "b".repeat(64),

    lock_id:
      "lock-1",

    lock_fingerprint:
      "c".repeat(64),

    action_digest:
      "d".repeat(64),

    authorized_snapshot_version:
      SHA,

    provider:
      "github",

    action:
      "create_issue",

    verified_at:
      "2026-11-02T03:07:58.000Z",

    result: {
      executor_version:
        "2",

      receipt_id:
        "receipt-1",

      consumption_id:
        "consumption-1",

      provider:
        "github",

      action:
        "create_issue",

      status:
        "EXECUTED",

      external_action_executed:
        true,

      completed_at:
        "2026-11-02T03:07:59.000Z",

      issue_number:
        1,

      html_url:
        "https://github.com/touhaf00/contextguard/issues/1",

      execution_snapshot_id:
        `github:touhaf00/contextguard@${SHA}`,

      execution_snapshot_version:
        SHA,

      execution_state_checked_at:
        "2026-11-02T03:07:58.500Z"
    }
  };
}

function proof(
  overrides = {}
) {
  return createExecutionProofV2(
    {
      ...input(),
      ...overrides
    },
    {
      proofId:
        "proof-1",

      createdAt:
        "2026-11-02T03:08:00.000Z"
    }
  );
}

test(
  "creates an integrity-bound proof of real external execution",
  () => {
    const value =
      proof();

    assert.equal(
      value.status,
      "EXTERNAL_ACTION_EXECUTED"
    );

    assert.equal(
      value.external_action_executed,
      true
    );

    assert.equal(
      value.provider_result.issue_number,
      1
    );

    assert.equal(
      value.provider_result.execution_snapshot_version,
      SHA
    );

    assert.match(
      value.provider_result_digest,
      /^[0-9a-f]{64}$/
    );

    assert.match(
      value.proof_digest,
      /^[0-9a-f]{64}$/
    );

    assert.equal(
      verifyExecutionProofIntegrityV2(
        value
      ),
      true
    );
  }
);

test(
  "detects mutation of provider execution evidence",
  () => {
    const value =
      proof();

    value.provider_result.issue_number =
      999;

    assert.equal(
      verifyExecutionProofIntegrityV2(
        value
      ),
      false
    );
  }
);

test(
  "rejects executor result bound to another receipt",
  () => {
    const value =
      input();

    value.result.receipt_id =
      "another-receipt";

    assert.throws(
      () =>
        createExecutionProofV2(
          value
        ),
      error =>
        error instanceof
          ExecutionProofErrorV2 &&
        error.code ===
          "RESULT_MISMATCH"
    );
  }
);

test(
  "rejects a result that does not confirm external execution",
  () => {
    const value =
      input();

    value.result.external_action_executed =
      false;

    value.result.status =
      "FAILED";

    assert.throws(
      () =>
        createExecutionProofV2(
          value
        ),
      error =>
        error instanceof
          ExecutionProofErrorV2 &&
        error.code ===
          "INVALID_RESULT"
    );
  }
);

test(
  "rejects proof creation before provider completion",
  () => {
    assert.throws(
      () =>
        createExecutionProofV2(
          input(),
          {
            createdAt:
              "2026-11-02T03:07:58.500Z"
          }
        ),
      error =>
        error instanceof
          ExecutionProofErrorV2 &&
        error.code ===
          "INVALID_TIME"
    );
  }
);

test(
  "stores and retrieves a detached execution proof",
  () => {
    const store =
      new ExecutionProofStoreV2();

    const original =
      proof();

    store.record(
      original
    );

    const stored =
      store.getByReceipt(
        "receipt-1"
      );

    assert.deepEqual(
      stored,
      original
    );

    stored.provider_result.issue_number =
      999;

    assert.equal(
      store
        .get(
          "proof-1"
        )
        .provider_result
        .issue_number,
      1
    );
  }
);

test(
  "rejects more than one execution proof for the same receipt",
  () => {
    const store =
      new ExecutionProofStoreV2();

    store.record(
      proof()
    );

    const second =
      createExecutionProofV2(
        input(),
        {
          proofId:
            "proof-2",

          createdAt:
            "2026-11-02T03:08:01.000Z"
        }
      );

    assert.throws(
      () =>
        store.record(
          second
        ),
      error =>
        error instanceof
          ExecutionProofStoreErrorV2 &&
        error.code ===
          "DUPLICATE_RECEIPT"
    );
  }
);

test(
  "fails closed when proof-store capacity is exhausted",
  () => {
    const store =
      new ExecutionProofStoreV2({
        capacity:
          1
      });

    store.record(
      proof()
    );

    const secondInput =
      input();

    secondInput.receipt_id =
      "receipt-2";

    secondInput.consumption_id =
      "consumption-2";

    secondInput.result.receipt_id =
      "receipt-2";

    secondInput.result.consumption_id =
      "consumption-2";

    const second =
      createExecutionProofV2(
        secondInput,
        {
          proofId:
            "proof-2",

          createdAt:
            "2026-11-02T03:08:01.000Z"
        }
      );

    assert.throws(
      () =>
        store.record(
          second
        ),
      error =>
        error instanceof
          ExecutionProofStoreErrorV2 &&
        error.code ===
          "CAPACITY_REACHED"
    );
  }
);

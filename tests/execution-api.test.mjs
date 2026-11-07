import assert from "node:assert/strict";
import test from "node:test";

import {
  digestCanonicalJson
} from "../dist/core/authorization-integrity.js";

import {
  ExecutionAuthorizationReceiptStoreV2,
  ExecutionReceiptStoreErrorV2
} from "../dist/api/v2/execution-receipt-store.js";

import {
  GenericExecutionApiErrorV2,
  executeExecutionAuthorizationApiV2
} from "../dist/api/v2/execution-api.js";

import {
  PostExecutionEvidenceErrorV2
} from "../dist/api/v2/execution-proof-audit.js";

import {
  verifyExecutionProofIntegrityV2
} from "../dist/api/v2/execution-proof.js";

import {
  GenericAuthorizationServiceErrorV2,
  GenericAuthorizationServiceV2
} from "../dist/api/v2/service.js";

function receipt() {
  const proposedAction = {
    namespace:
      "github",

    action:
      "create_issue",

    parameters: {
      title:
        "Controlled execution",

      body:
        "ContextGuard authorization test."
    }
  };

  const base = {
    receipt_version:
      "2",

    receipt_id:
      "receipt-execute-1",

    session_id:
      "session-execute-1",

    request_id:
      "request-execute-1",

    lock_id:
      "lock-execute-1",

    lock_fingerprint:
      "a".repeat(64),

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
      "github:snapshot-1",

    authorized_snapshot_version:
      "1".repeat(40),

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
      "approval-execute-1",

    approval_principal_id:
      "operator",

    approval_record_digest:
      "d".repeat(64),

    approval_attestation_digest:
      "e".repeat(64),

    preflight_checked_at:
      "2026-11-02T02:10:00.000Z",

    preflight_response_digest:
      "f".repeat(64),

    issued_at:
      "2026-11-02T02:10:30.000Z",

    expires_at:
      "2026-11-02T02:20:00.000Z",

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

function setup() {
  const store =
    new ExecutionAuthorizationReceiptStoreV2();

  const authorization =
    receipt();

  store.record(
    authorization,
    {
      storedAt:
        "2026-11-02T02:11:00.000Z"
    }
  );

  return {
    store,
    authorization
  };
}

function options() {
  return {
    consumedAt:
      "2026-11-02T02:12:00.000Z",

    consumptionId:
      "consumption-execute-1",

    checkedAt:
      "2026-11-02T02:13:00.000Z"
  };
}

function successExecutor(
  calls
) {
  return {
    async execute(
      authorization
    ) {
      calls.push(
        authorization
      );

      return {
        executor_version:
          "2",

        receipt_id:
          authorization
            .receipt
            .receipt_id,

        consumption_id:
          authorization
            .consumption
            .consumption_id,

        provider:
          "github",

        action:
          "create_issue",

        status:
          "EXECUTED",

        external_action_executed:
          true,

        completed_at:
          "2026-11-02T02:14:00.000Z"
      };
    }
  };
}

test(
  "execution API atomically consumes stored receipt and calls trusted executor once",
  async () => {
    const {
      store,
      authorization
    } =
      setup();

    const calls =
      [];

    const response =
      await executeExecutionAuthorizationApiV2(
        {
          receipt_id:
            authorization.receipt_id,

          receipt_digest:
            authorization.receipt_digest
        },
        store,
        successExecutor(
          calls
        ),
        options()
      );

    assert.equal(
      calls.length,
      1
    );

    assert.equal(
      calls[0].status,
      "TRUSTED_EXECUTION_AUTHORIZATION_VERIFIED"
    );

    assert.equal(
      response.status,
      "EXECUTED"
    );

    assert.equal(
      response.external_action_executed,
      true
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
  "caller cannot inject a consumption into execution API",
  async () => {
    const {
      store,
      authorization
    } =
      setup();

    let called =
      false;

    await assert.rejects(
      executeExecutionAuthorizationApiV2(
        {
          receipt_id:
            authorization.receipt_id,

          receipt_digest:
            authorization.receipt_digest,

          consumption: {
            forged:
              true
          }
        },
        store,
        {
          async execute() {
            called =
              true;
          }
        },
        options()
      ),
      error =>
        error instanceof
          GenericExecutionApiErrorV2 &&
        error.code ===
          "UNSUPPORTED_FIELD"
    );

    assert.equal(
      called,
      false
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
  "wrong receipt digest blocks execution before consumption",
  async () => {
    const {
      store,
      authorization
    } =
      setup();

    let called =
      false;

    await assert.rejects(
      executeExecutionAuthorizationApiV2(
        {
          receipt_id:
            authorization.receipt_id,

          receipt_digest:
            "9".repeat(64)
        },
        store,
        {
          async execute() {
            called =
              true;
          }
        },
        options()
      ),
      error =>
        error instanceof
          ExecutionReceiptStoreErrorV2 &&
        error.code ===
          "DIGEST_MISMATCH"
    );

    assert.equal(
      called,
      false
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
  "execution API blocks replay before a second executor call",
  async () => {
    const {
      store,
      authorization
    } =
      setup();

    const calls =
      [];

    const executor =
      successExecutor(
        calls
      );

    const body = {
      receipt_id:
        authorization.receipt_id,

      receipt_digest:
        authorization.receipt_digest
    };

    await executeExecutionAuthorizationApiV2(
      body,
      store,
      executor,
      options()
    );

    await assert.rejects(
      executeExecutionAuthorizationApiV2(
        body,
        store,
        executor,
        options()
      ),
      error =>
        error instanceof
          ExecutionReceiptStoreErrorV2 &&
        error.code ===
          "ALREADY_CONSUMED"
    );

    assert.equal(
      calls.length,
      1
    );
  }
);

test(
  "executor failure still burns the receipt and prevents automatic retry",
  async () => {
    const {
      store,
      authorization
    } =
      setup();

    let calls =
      0;

    const executor = {
      async execute() {
        calls +=
          1;

        throw new Error(
          "provider outcome unavailable"
        );
      }
    };

    const body = {
      receipt_id:
        authorization.receipt_id,

      receipt_digest:
        authorization.receipt_digest
    };

    await assert.rejects(
      executeExecutionAuthorizationApiV2(
        body,
        store,
        executor,
        options()
      ),
      /provider outcome unavailable/
    );

    assert.equal(
      store.get(
        authorization.receipt_id
      ).state,
      "CONSUMED"
    );

    await assert.rejects(
      executeExecutionAuthorizationApiV2(
        body,
        store,
        executor,
        options()
      ),
      error =>
        error instanceof
          ExecutionReceiptStoreErrorV2 &&
        error.code ===
          "ALREADY_CONSUMED"
    );

    assert.equal(
      calls,
      1
    );
  }
);

test(
  "executor result cannot claim another receipt",
  async () => {
    const {
      store,
      authorization
    } =
      setup();

    await assert.rejects(
      executeExecutionAuthorizationApiV2(
        {
          receipt_id:
            authorization.receipt_id,

          receipt_digest:
            authorization.receipt_digest
        },
        store,
        {
          async execute(
            trusted
          ) {
            return {
              executor_version:
                "2",

              receipt_id:
                "receipt-attacker",

              consumption_id:
                trusted
                  .consumption
                  .consumption_id,

              provider:
                "github",

              action:
                "create_issue",

              status:
                "EXECUTED",

              external_action_executed:
                true,

              completed_at:
                "2026-11-02T02:14:00.000Z"
            };
          }
        },
        options()
      ),
      error =>
        error instanceof
          GenericExecutionApiErrorV2 &&
        error.code ===
          "EXECUTOR_RESULT_MISMATCH"
    );
  }
);

test(
  "authorization service fails closed when trusted executor is not configured",
  async () => {
    const service =
      new GenericAuthorizationServiceV2();

    await assert.rejects(
      service.executeReceipt({
        receipt_id:
          "receipt-1",

        receipt_digest:
          "a".repeat(64)
      }),
      error =>
        error instanceof
          GenericAuthorizationServiceErrorV2 &&
        error.code ===
          "EXECUTOR_NOT_CONFIGURED"
    );
  }
);

test(
  "authorization service delegates execution only to its configured trusted executor",
  async () => {
    const {
      store,
      authorization
    } =
      setup();

    const calls =
      [];

    const service =
      new GenericAuthorizationServiceV2({
        executionReceiptStore:
          store,

        trustedExecutor:
          successExecutor(
            calls
          )
      });

    const result =
      await service.executeReceipt(
        {
          receipt_id:
            authorization.receipt_id,

          receipt_digest:
            authorization.receipt_digest
        },
        options()
      );

    assert.equal(
      result.status,
      "EXECUTED"
    );

    assert.equal(
      calls.length,
      1
    );
  }
);

test(
  "successful execution creates integrity proof and chained audit record",
  async () => {
    const {
      store,
      authorization
    } =
      setup();

    const response =
      await executeExecutionAuthorizationApiV2(
        {
          receipt_id:
            authorization.receipt_id,

          receipt_digest:
            authorization.receipt_digest
        },
        store,
        successExecutor([]),
        options()
      );

    assert.equal(
      verifyExecutionProofIntegrityV2(
        response.proof
      ),
      true
    );

    assert.equal(
      response.proof
        .external_action_executed,
      true
    );

    assert.equal(
      response.audit_record
        .event_type,
      "external_execution_succeeded"
    );

    assert.equal(
      response.audit_record
        .payload
        .proof_digest,
      response.proof
        .proof_digest
    );

    assert.equal(
      response.audit_checkpoint
        .event_count,
      1
    );

    assert.equal(
      response.audit_checkpoint
        .head_hash,
      response.audit_record
        .event_hash
    );
  }
);

test(
  "authorization service retains execution proof and audit after success",
  async () => {
    const {
      store,
      authorization
    } =
      setup();

    const service =
      new GenericAuthorizationServiceV2({
        executionReceiptStore:
          store,

        trustedExecutor:
          successExecutor([])
      });

    const response =
      await service.executeReceipt(
        {
          receipt_id:
            authorization.receipt_id,

          receipt_digest:
            authorization.receipt_digest
        },
        options()
      );

    assert.deepEqual(
      service.executionProofs
        .getByReceipt(
          authorization.receipt_id
        ),
      response.proof
    );

    const audit =
      await service.executionAudit
        .readAll();

    assert.equal(
      audit.length,
      1
    );

    assert.equal(
      audit[0]
        .payload
        .proof_id,
      response.proof
        .proof_id
    );
  }
);

test(
  "post-execution proof failure remains explicit and receipt stays burned",
  async () => {
    const {
      store,
      authorization
    } =
      setup();

    let calls =
      0;

    await assert.rejects(
      executeExecutionAuthorizationApiV2(
        {
          receipt_id:
            authorization.receipt_id,

          receipt_digest:
            authorization.receipt_digest
        },
        store,
        successExecutor({
          push() {
            calls +=
              1;
          }
        }),
        options(),
        {
          proofStore: {
            record() {
              throw new Error(
                "simulated proof store failure"
              );
            }
          }
        }
      ),
      error =>
        error instanceof
          PostExecutionEvidenceErrorV2 &&
        error.code ===
          "EXECUTION_PROOF_RECORDING_FAILED" &&
        error.external_action_executed ===
          true &&
        error.result.status ===
          "EXECUTED"
    );

    assert.equal(
      calls,
      1
    );

    assert.equal(
      store.get(
        authorization.receipt_id
      ).state,
      "CONSUMED"
    );
  }
);

import assert from "node:assert/strict";
import test from "node:test";

import {
  digestCanonicalJson
} from "../dist/core/authorization-integrity.js";

import {
  TrustedExecutionAuthorizationErrorV2,
  validateTrustedExecutionAuthorizationV2
} from "../dist/core/trusted-executor.js";

function receipt() {
  const action = {
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
      "receipt-executor-1",

    session_id:
      "session-executor-1",

    request_id:
      "request-executor-1",

    lock_id:
      "lock-executor-1",

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
      "github:touhaf00/contextguard@state-v1",

    authorized_snapshot_version:
      "state-v1",

    proposed_action:
      action,

    action_digest:
      digestCanonicalJson(
        action
      ),

    policy_digest:
      "b".repeat(64),

    runtime_digest:
      "c".repeat(64),

    approval_requirement:
      "REQUIRED",

    approval_id:
      "approval-executor-1",

    approval_principal_id:
      "operator-executor",

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
      "2026-11-02T02:20:00Z",

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

function consumption(
  authorization
) {
  const base = {
    consumption_version:
      "2",

    consumption_id:
      "consumption-executor-1",

    receipt_id:
      authorization.receipt_id,

    receipt_digest:
      authorization.receipt_digest,

    lock_id:
      authorization.lock_id,

    lock_fingerprint:
      authorization.lock_fingerprint,

    action_digest:
      authorization.action_digest,

    authorized_snapshot_version:
      authorization
        .authorized_snapshot_version,

    status:
      "CONSUMED_FOR_EXECUTION",

    consumed_at:
      "2026-11-02T02:12:00.000Z",

    execution_configured:
      false,

    external_action_executed:
      false
  };

  return {
    ...base,

    consumption_digest:
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
        TrustedExecutionAuthorizationErrorV2 &&
      error.code ===
        code
  );
}

test(
  "trusted executor authorization verifies exact consumed receipt binding",
  () => {
    const authorization =
      receipt();

    const consumed =
      consumption(
        authorization
      );

    const verified =
      validateTrustedExecutionAuthorizationV2(
        authorization,
        consumed,
        {
          checkedAt:
            "2026-11-02T02:13:00Z"
        }
      );

    assert.equal(
      verified.status,
      "TRUSTED_EXECUTION_AUTHORIZATION_VERIFIED"
    );

    assert.equal(
      verified.receipt
        .receipt_id,
      authorization.receipt_id
    );

    assert.equal(
      verified.consumption
        .consumption_id,
      consumed.consumption_id
    );

    assert.equal(
      verified.external_action_executed,
      false
    );
  }
);

test(
  "tampered authorization receipt is rejected",
  () => {
    const authorization =
      receipt();

    const consumed =
      consumption(
        authorization
      );

    authorization
      .proposed_action
      .parameters
      .environment =
      "attacker";

    expectCode(
      () =>
        validateTrustedExecutionAuthorizationV2(
          authorization,
          consumed,
          {
            checkedAt:
              "2026-11-02T02:13:00Z"
          }
        ),
      "INVALID_RECEIPT"
    );
  }
);

test(
  "consumption from another receipt is rejected",
  () => {
    const authorization =
      receipt();

    const consumed =
      consumption(
        authorization
      );

    consumed.receipt_id =
      "receipt-attacker";

    const base = {
      ...consumed
    };

    delete base
      .consumption_digest;

    consumed.consumption_digest =
      digestCanonicalJson(
        base
      );

    expectCode(
      () =>
        validateTrustedExecutionAuthorizationV2(
          authorization,
          consumed,
          {
            checkedAt:
              "2026-11-02T02:13:00Z"
          }
        ),
      "RECEIPT_MISMATCH"
    );
  }
);

test(
  "consumption bound to another ActionLock is rejected",
  () => {
    const authorization =
      receipt();

    const consumed =
      consumption(
        authorization
      );

    consumed.lock_fingerprint =
      "9".repeat(64);

    const base = {
      ...consumed
    };

    delete base
      .consumption_digest;

    consumed.consumption_digest =
      digestCanonicalJson(
        base
      );

    expectCode(
      () =>
        validateTrustedExecutionAuthorizationV2(
          authorization,
          consumed,
          {
            checkedAt:
              "2026-11-02T02:13:00Z"
          }
        ),
      "LOCK_MISMATCH"
    );
  }
);

test(
  "different action digest is rejected",
  () => {
    const authorization =
      receipt();

    const consumed =
      consumption(
        authorization
      );

    consumed.action_digest =
      "9".repeat(64);

    const base = {
      ...consumed
    };

    delete base
      .consumption_digest;

    consumed.consumption_digest =
      digestCanonicalJson(
        base
      );

    expectCode(
      () =>
        validateTrustedExecutionAuthorizationV2(
          authorization,
          consumed,
          {
            checkedAt:
              "2026-11-02T02:13:00Z"
          }
        ),
      "ACTION_MISMATCH"
    );
  }
);

test(
  "different resource version is rejected",
  () => {
    const authorization =
      receipt();

    const consumed =
      consumption(
        authorization
      );

    consumed.authorized_snapshot_version =
      "state-v2";

    const base = {
      ...consumed
    };

    delete base
      .consumption_digest;

    consumed.consumption_digest =
      digestCanonicalJson(
        base
      );

    expectCode(
      () =>
        validateTrustedExecutionAuthorizationV2(
          authorization,
          consumed,
          {
            checkedAt:
              "2026-11-02T02:13:00Z"
          }
        ),
      "SNAPSHOT_MISMATCH"
    );
  }
);

test(
  "tampered consumption digest is rejected",
  () => {
    const authorization =
      receipt();

    const consumed =
      consumption(
        authorization
      );

    consumed.consumption_digest =
      "9".repeat(64);

    expectCode(
      () =>
        validateTrustedExecutionAuthorizationV2(
          authorization,
          consumed,
          {
            checkedAt:
              "2026-11-02T02:13:00Z"
          }
        ),
      "INVALID_CONSUMPTION"
    );
  }
);

test(
  "trusted execution cannot start after receipt expiry",
  () => {
    const authorization =
      receipt();

    const consumed =
      consumption(
        authorization
      );

    expectCode(
      () =>
        validateTrustedExecutionAuthorizationV2(
          authorization,
          consumed,
          {
            checkedAt:
              "2026-11-02T02:20:00Z"
          }
        ),
      "AUTHORIZATION_EXPIRED"
    );
  }
);

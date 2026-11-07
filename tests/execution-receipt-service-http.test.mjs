import assert from "node:assert/strict";
import test from "node:test";

import {
  GenericAuthorizationServiceHttpV2
} from "../dist/api/v2/service-http.js";

import {
  GenericRuntimeAccessGateV2
} from "../dist/api/v2/runtime-access.js";

import {
  GenericApprovalAccessGateV2
} from "../dist/api/v2/approval-access.js";

import {
  ExecutionReceiptApiErrorV2
} from "../dist/api/v2/execution-receipt-api.js";

import {
  ExecutionReceiptStoreErrorV2
} from "../dist/api/v2/execution-receipt-store.js";

function runtimeGate() {
  return new GenericRuntimeAccessGateV2({
    accessToken:
      "runtime-receipt-secret"
  });
}

function approvalGate() {
  return new GenericApprovalAccessGateV2({
    accessToken:
      "approval-receipt-secret",

    principalId:
      "operator-receipt"
  });
}

function service(
  overrides = {}
) {
  return {
    authorize() {
      throw new Error(
        "unused"
      );
    },

    approve() {
      throw new Error(
        "unused"
      );
    },

    async preflight() {
      throw new Error(
        "unused"
      );
    },

    async issueExecutionReceipt() {
      throw new Error(
        "unused"
      );
    },

    consumeExecutionReceipt() {
      throw new Error(
        "unused"
      );
    },

    ...overrides
  };
}

test(
  "execution receipt issuance requires trusted runtime authentication",
  async () => {
    let called =
      false;

    const http =
      new GenericAuthorizationServiceHttpV2(
        service({
          async issueExecutionReceipt() {
            called =
              true;

            throw new Error(
              "must not run"
            );
          }
        }),
        approvalGate(),
        runtimeGate()
      );

    const result =
      await http
        .issueExecutionReceipt(
          {
            session_id:
              "session-1"
          },
          undefined
        );

    assert.equal(
      result.status,
      401
    );

    assert.equal(
      called,
      false
    );
  }
);

test(
  "trusted runtime can issue an execution receipt through HTTP boundary",
  async () => {
    const http =
      new GenericAuthorizationServiceHttpV2(
        service({
          async issueExecutionReceipt(
            body
          ) {
            return {
              api_version:
                "2",

              session_id:
                body.session_id,

              request_id:
                "request-1",

              status:
                "EXECUTION_AUTHORIZATION_ISSUED",

              next_step:
                "CONSUME_BEFORE_EXECUTION",

              receipt: {
                receipt_id:
                  "receipt-1"
              },

              execution_configured:
                false,

              external_action_executed:
                false
            };
          }
        }),
        approvalGate(),
        runtimeGate()
      );

    const result =
      await http
        .issueExecutionReceipt(
          {
            session_id:
              "session-1"
          },
          "Bearer runtime-receipt-secret"
        );

    assert.equal(
      result.status,
      200
    );

    assert.equal(
      result.body.status,
      "EXECUTION_AUTHORIZATION_ISSUED"
    );

    assert.equal(
      result.body.external_action_executed,
      false
    );
  }
);

test(
  "receipt issue API validation failures become HTTP 400",
  async () => {
    const http =
      new GenericAuthorizationServiceHttpV2(
        service({
          async issueExecutionReceipt() {
            throw new ExecutionReceiptApiErrorV2(
              "INVALID_BODY",
              "bad body"
            );
          }
        }),
        approvalGate(),
        runtimeGate()
      );

    const result =
      await http
        .issueExecutionReceipt(
          {},
          "Bearer runtime-receipt-secret"
        );

    assert.equal(
      result.status,
      400
    );

    assert.equal(
      result.body.error.code,
      "INVALID_BODY"
    );
  }
);

test(
  "execution receipt consumption requires trusted runtime authentication",
  () => {
    let called =
      false;

    const http =
      new GenericAuthorizationServiceHttpV2(
        service({
          consumeExecutionReceipt() {
            called =
              true;

            throw new Error(
              "must not run"
            );
          }
        }),
        approvalGate(),
        runtimeGate()
      );

    const result =
      http.consumeExecutionReceipt(
        {
          receipt_id:
            "receipt-1",

          receipt_digest:
            "a".repeat(64)
        },
        undefined
      );

    assert.equal(
      result.status,
      401
    );

    assert.equal(
      called,
      false
    );
  }
);

test(
  "trusted runtime can consume an execution receipt",
  () => {
    const http =
      new GenericAuthorizationServiceHttpV2(
        service({
          consumeExecutionReceipt(
            body
          ) {
            return {
              api_version:
                "2",

              receipt_id:
                body.receipt_id,

              status:
                "EXECUTION_AUTHORIZATION_CONSUMED",

              next_step:
                "TRUSTED_EXECUTOR",

              consumption: {
                status:
                  "CONSUMED_FOR_EXECUTION"
              },

              execution_configured:
                false,

              external_action_executed:
                false
            };
          }
        }),
        approvalGate(),
        runtimeGate()
      );

    const result =
      http.consumeExecutionReceipt(
        {
          receipt_id:
            "receipt-1",

          receipt_digest:
            "a".repeat(64)
        },
        "Bearer runtime-receipt-secret"
      );

    assert.equal(
      result.status,
      200
    );

    assert.equal(
      result.body.status,
      "EXECUTION_AUTHORIZATION_CONSUMED"
    );

    assert.equal(
      result.body.external_action_executed,
      false
    );
  }
);

test(
  "receipt replay becomes HTTP 409",
  () => {
    const http =
      new GenericAuthorizationServiceHttpV2(
        service({
          consumeExecutionReceipt() {
            throw new ExecutionReceiptStoreErrorV2(
              "ALREADY_CONSUMED",
              "already consumed"
            );
          }
        }),
        approvalGate(),
        runtimeGate()
      );

    const result =
      http.consumeExecutionReceipt(
        {
          receipt_id:
            "receipt-1",

          receipt_digest:
            "a".repeat(64)
        },
        "Bearer runtime-receipt-secret"
      );

    assert.equal(
      result.status,
      409
    );

    assert.equal(
      result.body.error.code,
      "ALREADY_CONSUMED"
    );
  }
);

test(
  "expired execution receipt becomes HTTP 410",
  () => {
    const http =
      new GenericAuthorizationServiceHttpV2(
        service({
          consumeExecutionReceipt() {
            throw new ExecutionReceiptStoreErrorV2(
              "EXPIRED",
              "receipt expired"
            );
          }
        }),
        approvalGate(),
        runtimeGate()
      );

    const result =
      http.consumeExecutionReceipt(
        {
          receipt_id:
            "receipt-1",

          receipt_digest:
            "a".repeat(64)
        },
        "Bearer runtime-receipt-secret"
      );

    assert.equal(
      result.status,
      410
    );

    assert.equal(
      result.body.error.code,
      "EXPIRED"
    );
  }
);

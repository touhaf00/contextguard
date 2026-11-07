import assert from "node:assert/strict";
import test from "node:test";

import {
  GenericAuthorizationServiceHttpV2
} from "../dist/api/v2/service-http.js";

import {
  GenericExecutorAccessGateV2
} from "../dist/api/v2/executor-access.js";

import {
  GenericAuthorizationServiceErrorV2
} from "../dist/api/v2/service.js";

import {
  GenericExecutionApiErrorV2
} from "../dist/api/v2/execution-api.js";

import {
  PostExecutionEvidenceErrorV2
} from "../dist/api/v2/execution-proof-audit.js";

import {
  TrustedExecutorStateErrorV2
} from "../dist/core/trusted-executor.js";

function unusedAccess() {
  return {
    authenticate() {}
  };
}

function http(
  executeReceipt,
  executorToken =
    "executor-secret"
) {
  return new GenericAuthorizationServiceHttpV2(
    {
      executeReceipt,

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

      preflight() {
        throw new Error(
          "unused"
        );
      },

      issueExecutionReceipt() {
        throw new Error(
          "unused"
        );
      },

      consumeExecutionReceipt() {
        throw new Error(
          "unused"
        );
      }
    },
    unusedAccess(),
    unusedAccess(),
    undefined,
    new GenericExecutorAccessGateV2({
      accessToken:
        executorToken
    })
  );
}

function success() {
  return {
    api_version:
      "2",

    receipt_id:
      "receipt-http-execute-1",

    consumption_id:
      "consumption-http-execute-1",

    status:
      "EXECUTED",

    result: {
      executor_version:
        "2",

      receipt_id:
        "receipt-http-execute-1",

      consumption_id:
        "consumption-http-execute-1",

      provider:
        "github",

      action:
        "create_issue",

      status:
        "EXECUTED",

      external_action_executed:
        true,

      completed_at:
        "2026-11-02T03:00:00.000Z"
    },

    execution_configured:
      true,

    external_action_executed:
      true
  };
}

test(
  "execution HTTP delegates only with executor credential",
  async () => {
    let calls =
      0;

    const adapter =
      http(
        async body => {
          calls +=
            1;

          assert.deepEqual(
            body,
            {
              receipt_id:
                "receipt-http-execute-1",

              receipt_digest:
                "a".repeat(64)
            }
          );

          return success();
        }
      );

    const result =
      await adapter.executeReceipt(
        {
          receipt_id:
            "receipt-http-execute-1",

          receipt_digest:
            "a".repeat(64)
        },
        "Bearer executor-secret"
      );

    assert.equal(
      result.status,
      200
    );

    assert.equal(
      result.body
        .external_action_executed,
      true
    );

    assert.equal(
      calls,
      1
    );
  }
);

test(
  "runtime credential cannot invoke executor HTTP boundary",
  async () => {
    let calls =
      0;

    const adapter =
      http(
        async () => {
          calls +=
            1;

          return success();
        }
      );

    const result =
      await adapter.executeReceipt(
        {
          receipt_id:
            "receipt-1",

          receipt_digest:
            "a".repeat(64)
        },
        "Bearer runtime-secret"
      );

    assert.equal(
      result.status,
      401
    );

    assert.equal(
      result.body
        .external_action_executed,
      false
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "missing executor credential blocks execution before service",
  async () => {
    let calls =
      0;

    const adapter =
      http(
        async () => {
          calls +=
            1;

          return success();
        }
      );

    const result =
      await adapter.executeReceipt(
        {},
        undefined
      );

    assert.equal(
      result.status,
      401
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "disabled executor access fails closed",
  async () => {
    let calls =
      0;

    const adapter =
      http(
        async () => {
          calls +=
            1;

          return success();
        },
        ""
      );

    const result =
      await adapter.executeReceipt(
        {},
        "Bearer anything"
      );

    assert.equal(
      result.status,
      503
    );

    assert.equal(
      result.body
        .external_action_executed,
      false
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "unconfigured trusted executor becomes HTTP 503",
  async () => {
    const adapter =
      http(
        async () => {
          throw new GenericAuthorizationServiceErrorV2(
            "EXECUTOR_NOT_CONFIGURED",
            "Trusted executor is not configured."
          );
        }
      );

    const result =
      await adapter.executeReceipt(
        {
          receipt_id:
            "receipt-1",

          receipt_digest:
            "a".repeat(64)
        },
        "Bearer executor-secret"
      );

    assert.equal(
      result.status,
      503
    );

    assert.equal(
      result.body.error.code,
      "EXECUTOR_NOT_CONFIGURED"
    );

    assert.equal(
      result.body
        .external_action_executed,
      false
    );
  }
);

test(
  "invalid execution request remains non-executing HTTP 400",
  async () => {
    const adapter =
      http(
        async () => {
          throw new GenericExecutionApiErrorV2(
            "UNSUPPORTED_FIELD",
            "Unsupported execution field."
          );
        }
      );

    const result =
      await adapter.executeReceipt(
        {
          receipt_id:
            "receipt-1",

          receipt_digest:
            "a".repeat(64),

          consumption:
            "forged"
        },
        "Bearer executor-secret"
      );

    assert.equal(
      result.status,
      400
    );

    assert.equal(
      result.body
        .external_action_executed,
      false
    );
  }
);

test(
  "provider failure never produces a success execution claim",
  async () => {
    const adapter =
      http(
        async () => {
          throw new Error(
            "provider timeout"
          );
        }
      );

    const result =
      await adapter.executeReceipt(
        {
          receipt_id:
            "receipt-1",

          receipt_digest:
            "a".repeat(64)
        },
        "Bearer executor-secret"
      );

    assert.equal(
      result.status,
      502
    );

    assert.equal(
      result.body.error.code,
      "EXECUTION_FAILED"
    );

    assert.equal(
      result.body
        .execution_configured,
      false
    );

    assert.equal(
      result.body
        .external_action_executed,
      false
    );
  }
);

test(
  "execution HTTP returns 409 when authorized provider state changed",
  async () => {
    const adapter =
      http(
        async () => {
          throw new TrustedExecutorStateErrorV2(
            "STATE_CHANGED",
            "Provider state changed."
          );
        }
      );

    const result =
      await adapter.executeReceipt(
        {
          receipt_id:
            "receipt-1",

          receipt_digest:
            "a".repeat(64)
        },
        "Bearer executor-secret"
      );

    assert.equal(
      result.status,
      409
    );

    assert.equal(
      result.body.error.code,
      "STATE_CHANGED"
    );

    assert.equal(
      result.body
        .external_action_executed,
      false
    );
  }
);

test(
  "execution HTTP returns 503 when fresh provider state cannot be resolved",
  async () => {
    const adapter =
      http(
        async () => {
          throw new TrustedExecutorStateErrorV2(
            "STATE_UNAVAILABLE",
            "Provider state unavailable."
          );
        }
      );

    const result =
      await adapter.executeReceipt(
        {
          receipt_id:
            "receipt-1",

          receipt_digest:
            "a".repeat(64)
        },
        "Bearer executor-secret"
      );

    assert.equal(
      result.status,
      503
    );

    assert.equal(
      result.body.error.code,
      "STATE_UNAVAILABLE"
    );

    assert.equal(
      result.body
        .external_action_executed,
      false
    );
  }
);

test(
  "HTTP never reports false when external execution succeeded but proof recording failed",
  async () => {
    const providerResult =
      success().result;

    const adapter =
      http(
        async () => {
          throw new PostExecutionEvidenceErrorV2(
            "EXECUTION_PROOF_RECORDING_FAILED",
            "External action executed, but execution proof recording failed.",
            providerResult
          );
        }
      );

    const result =
      await adapter.executeReceipt(
        {
          receipt_id:
            "receipt-http-execute-1",

          receipt_digest:
            "a".repeat(64)
        },
        "Bearer executor-secret"
      );

    assert.equal(
      result.status,
      500
    );

    assert.equal(
      result.body
        .execution_status,
      "EXECUTED_EVIDENCE_INCOMPLETE"
    );

    assert.equal(
      result.body
        .external_action_executed,
      true
    );

    assert.equal(
      result.body
        .execution_configured,
      true
    );

    assert.equal(
      result.body
        .result
        .status,
      "EXECUTED"
    );

    assert.equal(
      result.body
        .error
        .code,
      "EXECUTION_PROOF_RECORDING_FAILED"
    );
  }
);

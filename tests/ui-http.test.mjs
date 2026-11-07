import assert from "node:assert/strict";
import test from "node:test";

import {
  ContextGuardUiAccessErrorV2,
  ContextGuardUiAccessGateV2
} from "../dist/api/ui/access.js";

import {
  ContextGuardUiHttpErrorV2,
  ContextGuardUiHttpV2
} from "../dist/api/ui/http.js";

function setup() {
  const calls = [];

  const flow = {
    async start(body) {
      calls.push([
        "start",
        body
      ]);

      return {
        stage:
          "AWAITING_HUMAN_APPROVAL"
      };
    }
  };

  const service = {
    approve(
      body,
      principal
    ) {
      calls.push([
        "approve",
        body,
        principal
      ]);

      return {
        status:
          "READY_FOR_PREFLIGHT"
      };
    },

    async preflight(body) {
      calls.push([
        "preflight",
        body
      ]);

      return {
        status:
          "AUTHORIZED_FOR_EXECUTOR"
      };
    },

    async issueExecutionReceipt(
      body
    ) {
      calls.push([
        "receipt",
        body
      ]);

      return {
        status:
          "EXECUTION_AUTHORIZATION_ISSUED"
      };
    },

    async executeReceipt(body) {
      calls.push([
        "execute",
        body
      ]);

      return {
        status:
          "EXECUTED",

        external_action_executed:
          true
      };
    }
  };

  const access =
    new ContextGuardUiAccessGateV2({
      accessToken:
        "ui-secret",

      principalId:
        "operator-ui",

      displayName:
        "UI Operator"
    });

  return {
    calls,

    http:
      new ContextGuardUiHttpV2(
        flow,
        service,
        access
      )
  };
}

test(
  "UI start authenticates before invoking trusted server flow",
  async () => {
    const {
      calls,
      http
    } =
      setup();

    await assert.rejects(
      http.start(
        {
          repository:
            "touhaf00/contextguard"
        },
        undefined
      ),
      error =>
        error instanceof
          ContextGuardUiAccessErrorV2 &&
        error.code ===
          "UNAUTHORIZED"
    );

    assert.equal(
      calls.length,
      0
    );
  }
);

test(
  "UI approval derives human principal from server authentication",
  () => {
    const {
      calls,
      http
    } =
      setup();

    const result =
      http.approve(
        {
          session_id:
            "session-1",

          decision:
            "APPROVED"
        },
        "Bearer ui-secret"
      );

    assert.equal(
      result.status,
      "READY_FOR_PREFLIGHT"
    );

    assert.equal(
      calls[0][0],
      "approve"
    );

    assert.equal(
      calls[0][2]
        .principal_id,
      "operator-ui"
    );

    assert.equal(
      calls[0][2]
        .authentication_method,
      "bearer_token"
    );
  }
);

test(
  "UI execution requires explicit literal EXECUTE confirmation",
  async () => {
    const {
      calls,
      http
    } =
      setup();

    await assert.rejects(
      http.execute(
        {
          receipt_id:
            "receipt-1",

          receipt_digest:
            "a".repeat(64),

          confirmation:
            "yes"
        },
        "Bearer ui-secret"
      ),
      error =>
        error instanceof
          ContextGuardUiHttpErrorV2 &&
        error.code ===
          "EXECUTION_CONFIRMATION_REQUIRED"
    );

    assert.equal(
      calls.length,
      0
    );
  }
);

test(
  "UI execution strips browser confirmation before trusted executor",
  async () => {
    const {
      calls,
      http
    } =
      setup();

    const result =
      await http.execute(
        {
          receipt_id:
            "receipt-1",

          receipt_digest:
            "a".repeat(64),

          confirmation:
            "EXECUTE"
        },
        "Bearer ui-secret"
      );

    assert.equal(
      result.external_action_executed,
      true
    );

    assert.deepEqual(
      calls[0],
      [
        "execute",
        {
          receipt_id:
            "receipt-1",

          receipt_digest:
            "a".repeat(64)
        }
      ]
    );
  }
);

test(
  "UI preserves truth when external execution succeeded but evidence recording failed",
  async () => {
    const {
      PostExecutionEvidenceErrorV2
    } =
      await import(
        "../dist/api/v2/execution-proof-audit.js"
      );

    const {
      contextGuardUiPostExecutionErrorV2
    } =
      await import(
        "../dist/api/ui/http.js"
      );

    const result = {
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
        "2026-11-02T04:30:00.000Z"
    };

    const error =
      new PostExecutionEvidenceErrorV2(
        "EXECUTION_PROOF_RECORDING_FAILED",
        "External action executed, but execution proof recording failed.",
        result
      );

    const mapped =
      contextGuardUiPostExecutionErrorV2(
        error
      );

    assert.equal(
      mapped.status,
      500
    );

    assert.equal(
      mapped.body
        .execution_status,
      "EXECUTED_EVIDENCE_INCOMPLETE"
    );

    assert.equal(
      mapped.body
        .external_action_executed,
      true
    );

    assert.equal(
      mapped.body
        .result
        .status,
      "EXECUTED"
    );
  }
);

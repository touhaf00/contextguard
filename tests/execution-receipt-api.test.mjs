import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizationRequestDigest
} from "../dist/core/authorization-integrity.js";

import {
  evidenceProtocolDigest
} from "../dist/core/evidence.js";

import {
  workerAssessmentDigest
} from "../dist/core/assessment.js";

import {
  createGenericActionLockV2
} from "../dist/core/action-lock.js";

import {
  ExecutionAuthorizationReceiptStoreV2,
  ExecutionReceiptStoreErrorV2
} from "../dist/api/v2/execution-receipt-store.js";

import {
  ExecutionReceiptApiErrorV2,
  issueExecutionAuthorizationApiV2,
  consumeExecutionAuthorizationApiV2
} from "../dist/api/v2/execution-receipt-api.js";

import {
  GenericAuthorizationServiceV2
} from "../dist/api/v2/service.js";

function fixtures() {
  const request = {
    request_id:
      "req-api-receipt-1",

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

    snapshot: {
      snapshot_id:
        "github:touhaf00/contextguard@state-v1",

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

      version:
        "state-v1",

      observed_at:
        "2026-11-02T02:00:00Z"
    },

    proposed_action: {
      namespace:
        "github",

      action:
        "deploy_release",

      parameters: {
        environment:
          "production"
      }
    },

    policy: {
      policy_id:
        "api-receipt-policy",

      version:
        "1.0.0",

      name:
        "API receipt policy",

      objective:
        "Verify exact state before execution.",

      decision_rules: [
        "State must remain unchanged."
      ],

      human_approval:
        "NONE",

      preflight_required:
        true
    },

    runtime: {
      platform:
        "cominty",

      worker_agent_id:
        "worker-api",

      guard_agent_id:
        "guard-api",

      tool_scope: [
        "github.read"
      ]
    },

    requested_at:
      "2026-11-02T02:01:00Z"
  };

  const evidence = {
    protocol_version:
      "2",

    request_digest:
      authorizationRequestDigest(
        request
      ),

    assembled_at:
      "2026-11-02T02:02:00Z",

    evidence: [
      {
        evidence_id:
          "E1",

        source_snapshot:
          JSON.parse(
            JSON.stringify(
              request.snapshot
            )
          ),

        locator:
          "github.main",

        observation:
          "Target state verified.",

        level:
          "OUTPUT_OBSERVED"
      }
    ],

    claims: [
      {
        claim_id:
          "C1",

        statement:
          "Target state verified.",

        criticality:
          "REQUIRED",

        status:
          "SUPPORTED",

        evidence_refs: [
          "E1"
        ]
      }
    ]
  };

  const worker = {
    protocol_version:
      "2",

    request_digest:
      authorizationRequestDigest(
        request
      ),

    evidence_digest:
      evidenceProtocolDigest(
        evidence,
        request
      ),

    decision:
      "READY",

    confidence:
      0.99,

    summary:
      "Ready.",

    assessed_at:
      "2026-11-02T02:03:00Z"
  };

  const guard = {
    protocol_version:
      "2",

    request_digest:
      authorizationRequestDigest(
        request
      ),

    evidence_digest:
      evidenceProtocolDigest(
        evidence,
        request
      ),

    worker_assessment_digest:
      workerAssessmentDigest(
        worker,
        evidence,
        request
      ),

    verdict:
      "PASS",

    risk:
      "LOW",

    verified_claims: [
      "C1"
    ],

    unverified_claims:
      [],

    contradicted_claims:
      [],

    findings:
      [],

    requested_checks:
      [],

    worker_decision_supported:
      true,

    retry_recommended:
      false,

    summary:
      "Supported.",

    verified_at:
      "2026-11-02T02:04:00Z"
  };

  const lock =
    createGenericActionLockV2(
      request,
      evidence,
      worker,
      guard,
      {
        intentId:
          "intent-api-receipt-1",

        lockId:
          "lock-api-receipt-1",

        createdAt:
          "2026-11-02T02:05:00Z"
      }
    );

  const session = {
    session_version:
      "2",

    session_id:
      "session-api-receipt-1",

    request_id:
      request.request_id,

    session_state:
      "READY_FOR_PREFLIGHT",

    lock_id:
      lock.lock_id,

    lock_fingerprint:
      lock.fingerprint,

    lock,

    created_at:
      "2026-11-02T02:05:30Z",

    expires_at:
      "2026-11-02T02:30:00Z",

    session_digest:
      "0".repeat(64)
  };

  const preflightResponse = {
    api_version:
      "2",

    session_id:
      session.session_id,

    request_id:
      session.request_id,

    status:
      "AUTHORIZED_FOR_EXECUTOR",

    next_step:
      "TRUSTED_EXECUTOR",

    preflight: {
      preflight_version:
        "2",

      lock_id:
        lock.lock_id,

      lock_fingerprint:
        lock.fingerprint,

      status:
        "PRE_EXECUTION_VERIFIED",

      approval_requirement:
        "NONE",

      approval_verified:
        false,

      subject_integrity_verified:
        true,

      snapshot_integrity_verified:
        true,

      action_integrity_verified:
        true,

      policy_integrity_verified:
        true,

      runtime_integrity_verified:
        true,

      observed_snapshot_version:
        "state-v1",

      execution_permitted_by_policy:
        true,

      execution_configured:
        false,

      external_action_executed:
        false,

      checked_at:
        "2026-11-02T02:10:00Z"
    },

    execution_configured:
      false,

    external_action_executed:
      false
  };

  const sessions = {
    get(
      id
    ) {
      assert.equal(
        id,
        session.session_id
      );

      return JSON.parse(
        JSON.stringify(
          session
        )
      );
    }
  };

  const approvals = {
    has() {
      return false;
    },

    get() {
      throw new Error(
        "approval must not be requested"
      );
    }
  };

  return {
    session,
    sessions,
    approvals,
    preflightResponse
  };
}

function store() {
  return new ExecutionAuthorizationReceiptStoreV2({
    now() {
      return new Date(
        "2026-11-02T02:11:00Z"
      );
    }
  });
}

function issueOptions(
  receiptId =
    "receipt-api-1"
) {
  return {
    receipt: {
      receiptId,

      issuedAt:
        "2026-11-02T02:10:30Z"
    },

    storedAt:
      "2026-11-02T02:11:00Z"
  };
}

test(
  "issue API accepts only session id and generates trusted preflight internally",
  async () => {
    const values =
      fixtures();

    let calls =
      0;

    const result =
      await issueExecutionAuthorizationApiV2(
        {
          session_id:
            values.session
              .session_id
        },
        values.sessions,
        values.approvals,
        store(),
        async (
          body
        ) => {
          calls +=
            1;

          assert.deepEqual(
            body,
            {
              session_id:
                values.session
                  .session_id
            }
          );

          return values
            .preflightResponse;
        },
        issueOptions()
      );

    assert.equal(
      calls,
      1
    );

    assert.equal(
      result.status,
      "EXECUTION_AUTHORIZATION_ISSUED"
    );

    assert.equal(
      result.receipt
        .lock_fingerprint,
      values.session
        .lock_fingerprint
    );

    assert.equal(
      result.external_action_executed,
      false
    );
  }
);

test(
  "issue API rejects caller supplied preflight or receipt material",
  async () => {
    const values =
      fixtures();

    await assert.rejects(
      () =>
        issueExecutionAuthorizationApiV2(
          {
            session_id:
              values.session
                .session_id,

            preflight: {
              status:
                "attacker"
            }
          },
          values.sessions,
          values.approvals,
          store(),
          async () =>
            values.preflightResponse,
          issueOptions()
        ),
      (error) =>
        error instanceof
          ExecutionReceiptApiErrorV2 &&
        error.code ===
          "UNSUPPORTED_FIELD"
    );
  }
);

test(
  "same ActionLock cannot receive two execution receipts through API",
  async () => {
    const values =
      fixtures();

    const receipts =
      store();

    await issueExecutionAuthorizationApiV2(
      {
        session_id:
          values.session
            .session_id
      },
      values.sessions,
      values.approvals,
      receipts,
      async () =>
        values.preflightResponse,
      issueOptions(
        "receipt-api-first"
      )
    );

    await assert.rejects(
      () =>
        issueExecutionAuthorizationApiV2(
          {
            session_id:
              values.session
                .session_id
          },
          values.sessions,
          values.approvals,
          receipts,
          async () =>
            values.preflightResponse,
          issueOptions(
            "receipt-api-second"
          )
        ),
      (error) =>
        error instanceof
          ExecutionReceiptStoreErrorV2 &&
        error.code ===
          "DUPLICATE_LOCK"
    );
  }
);

test(
  "consume API requires exact receipt id and digest",
  async () => {
    const values =
      fixtures();

    const receipts =
      store();

    const issued =
      await issueExecutionAuthorizationApiV2(
        {
          session_id:
            values.session
              .session_id
        },
        values.sessions,
        values.approvals,
        receipts,
        async () =>
          values.preflightResponse,
        issueOptions()
      );

    const result =
      consumeExecutionAuthorizationApiV2(
        {
          receipt_id:
            issued.receipt
              .receipt_id,

          receipt_digest:
            issued.receipt
              .receipt_digest
        },
        receipts,
        {
          consumedAt:
            "2026-11-02T02:12:00Z",

          consumptionId:
            "consumption-api-1"
        }
      );

    assert.equal(
      result.status,
      "EXECUTION_AUTHORIZATION_CONSUMED"
    );

    assert.equal(
      result.consumption
        .status,
      "CONSUMED_FOR_EXECUTION"
    );

    assert.equal(
      result.external_action_executed,
      false
    );
  }
);

test(
  "consume API rejects a wrong receipt digest",
  async () => {
    const values =
      fixtures();

    const receipts =
      store();

    const issued =
      await issueExecutionAuthorizationApiV2(
        {
          session_id:
            values.session
              .session_id
        },
        values.sessions,
        values.approvals,
        receipts,
        async () =>
          values.preflightResponse,
        issueOptions()
      );

    assert.throws(
      () =>
        consumeExecutionAuthorizationApiV2(
          {
            receipt_id:
              issued.receipt
                .receipt_id,

            receipt_digest:
              "9".repeat(64)
          },
          receipts,
          {
            consumedAt:
              "2026-11-02T02:12:00Z"
          }
        ),
      (error) =>
        error instanceof
          ExecutionReceiptStoreErrorV2 &&
        error.code ===
          "DIGEST_MISMATCH"
    );
  }
);

test(
  "consume API blocks replay",
  async () => {
    const values =
      fixtures();

    const receipts =
      store();

    const issued =
      await issueExecutionAuthorizationApiV2(
        {
          session_id:
            values.session
              .session_id
        },
        values.sessions,
        values.approvals,
        receipts,
        async () =>
          values.preflightResponse,
        issueOptions()
      );

    const body = {
      receipt_id:
        issued.receipt
          .receipt_id,

      receipt_digest:
        issued.receipt
          .receipt_digest
    };

    consumeExecutionAuthorizationApiV2(
      body,
      receipts,
      {
        consumedAt:
          "2026-11-02T02:12:00Z"
      }
    );

    assert.throws(
      () =>
        consumeExecutionAuthorizationApiV2(
          body,
          receipts,
          {
            consumedAt:
              "2026-11-02T02:13:00Z"
          }
        ),
      (error) =>
        error instanceof
          ExecutionReceiptStoreErrorV2 &&
        error.code ===
          "ALREADY_CONSUMED"
    );
  }
);

test(
  "authorization service issues receipt only through its own preflight boundary",
  async () => {
    const values =
      fixtures();

    const receipts =
      store();

    const service =
      new GenericAuthorizationServiceV2({
        sessionStore:
          values.sessions,

        approvalStore:
          values.approvals,

        executionReceiptStore:
          receipts,

        preflightResolverRegistry:
          {},

        preflightContextProvider:
          {}
      });

    let calls =
      0;

    service.preflight =
      async (
        body
      ) => {
        calls +=
          1;

        assert.deepEqual(
          body,
          {
            session_id:
              values.session
                .session_id
          }
        );

        return values
          .preflightResponse;
      };

    const issued =
      await service
        .issueExecutionReceipt(
          {
            session_id:
              values.session
                .session_id
          },
          {
            ...issueOptions()
          }
        );

    assert.equal(
      calls,
      1
    );

    assert.equal(
      issued.status,
      "EXECUTION_AUTHORIZATION_ISSUED"
    );
  }
);

test(
  "authorization service consumes issued receipt without executing external action",
  async () => {
    const values =
      fixtures();

    const receipts =
      store();

    const service =
      new GenericAuthorizationServiceV2({
        sessionStore:
          values.sessions,

        approvalStore:
          values.approvals,

        executionReceiptStore:
          receipts,

        preflightResolverRegistry:
          {},

        preflightContextProvider:
          {}
      });

    service.preflight =
      async () =>
        values.preflightResponse;

    const issued =
      await service
        .issueExecutionReceipt(
          {
            session_id:
              values.session
                .session_id
          },
          issueOptions()
        );

    const consumed =
      service
        .consumeExecutionReceipt(
          {
            receipt_id:
              issued.receipt
                .receipt_id,

            receipt_digest:
              issued.receipt
                .receipt_digest
          },
          {
            consumedAt:
              "2026-11-02T02:12:00Z",

            consumptionId:
              "consumption-service-1"
          }
        );

    assert.equal(
      consumed.status,
      "EXECUTION_AUTHORIZATION_CONSUMED"
    );

    assert.equal(
      consumed.execution_configured,
      false
    );

    assert.equal(
      consumed.external_action_executed,
      false
    );
  }
);

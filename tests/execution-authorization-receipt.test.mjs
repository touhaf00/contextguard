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
  createApprovalAttestationV2
} from "../dist/core/approval-attestation.js";

import {
  performGenericPreflightV2
} from "../dist/core/preflight.js";

import {
  AuthorizationApprovalStoreV2
} from "../dist/api/v2/approval-store.js";

import {
  createExecutionAuthorizationReceiptV2,
  ExecutionAuthorizationReceiptErrorV2,
  verifyExecutionAuthorizationReceiptIntegrityV2
} from "../dist/api/v2/execution-receipt.js";

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

function fixtures(
  humanApproval =
    "REQUIRED",
  approvalTtlMs =
    10 * 60 * 1000
) {
  const request = {
    request_id:
      "req-receipt-1",

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
        "github:touhaf00/contextguard@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

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
        "a".repeat(40),

      observed_at:
        "2026-11-02T01:00:00Z"
    },

    proposed_action: {
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
    },

    policy: {
      policy_id:
        "receipt-policy",

      version:
        "1.0.0",

      name:
        "Receipt policy",

      objective:
        "Verify exact authorization before execution.",

      decision_rules: [
        "Target state must remain unchanged."
      ],

      human_approval:
        humanApproval,

      preflight_required:
        true
    },

    runtime: {
      platform:
        "cominty",

      worker_agent_id:
        "worker-receipt",

      guard_agent_id:
        "guard-receipt",

      tool_scope: [
        "github.read"
      ]
    },

    requested_at:
      "2026-11-02T01:01:00Z"
  };

  const evidence = {
    protocol_version:
      "2",

    request_digest:
      authorizationRequestDigest(
        request
      ),

    assembled_at:
      "2026-11-02T01:02:00Z",

    evidence: [
      {
        evidence_id:
          "E1",

        source_snapshot:
          clone(
            request.snapshot
          ),

        locator:
          "github.main",

        observation:
          "Target resolves to the locked commit.",

        level:
          "OUTPUT_OBSERVED"
      }
    ],

    claims: [
      {
        claim_id:
          "C1",

        statement:
          "Target resolves to the locked commit.",

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
      "Target is ready.",

    assessed_at:
      "2026-11-02T01:03:00Z"
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
      "Authorization evidence is supported.",

    verified_at:
      "2026-11-02T01:04:00Z"
  };

  const lock =
    createGenericActionLockV2(
      request,
      evidence,
      worker,
      guard,
      {
        intentId:
          "intent-receipt-1",

        lockId:
          "lock-receipt-1",

        createdAt:
          "2026-11-02T01:05:00Z"
      }
    );

  const session = {
    session_version:
      "2",

    session_id:
      "session-receipt-1",

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
      "2026-11-02T01:05:30Z",

    expires_at:
      "2026-11-02T01:30:00Z",

    session_digest:
      "0".repeat(64)
  };

  let approvalRecord;

  let approval;

  if (
    humanApproval !==
      "NONE"
  ) {
    approval =
      createApprovalAttestationV2(
        lock,
        {
          principal_type:
            "HUMAN",

          principal_id:
            "operator-receipt",

          authentication_method:
            "bearer_token"
        },
        "APPROVED",
        {
          approvalId:
            "approval-receipt-1",

          decidedAt:
            "2026-11-02T01:06:00Z",

          ttlMs:
            approvalTtlMs
        }
      );

    const approvalStore =
      new AuthorizationApprovalStoreV2();

    approvalRecord =
      approvalStore.record(
        session,
        approval
      );
  }

  const preflight =
    performGenericPreflightV2(
      lock,
      approval,
      {
        snapshot: {
          ...clone(
            request.snapshot
          ),

          snapshot_id:
            "github-fresh-observation",

          observed_at:
            "2026-11-02T01:07:00Z"
        },

        proposed_action:
          clone(
            request.proposed_action
          ),

        policy:
          clone(
            request.policy
          ),

        runtime:
          clone(
            request.runtime
          )
      },
      {
        checkedAt:
          "2026-11-02T01:08:00Z"
      }
    );

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

    preflight,

    execution_configured:
      false,

    external_action_executed:
      false
  };

  return {
    request,
    session,
    approvalRecord,
    preflightResponse
  };
}

test(
  "execution receipt binds exact lock action snapshot approval and preflight",
  () => {
    const values =
      fixtures();

    const receipt =
      createExecutionAuthorizationReceiptV2(
        values.session,
        values.preflightResponse,
        values.approvalRecord,
        {
          receiptId:
            "receipt-1",

          issuedAt:
            "2026-11-02T01:08:30Z"
        }
      );

    assert.equal(
      receipt.status,
      "AUTHORIZED_FOR_EXECUTOR"
    );

    assert.equal(
      receipt.lock_fingerprint,
      values.session
        .lock_fingerprint
    );

    assert.equal(
      receipt.authorized_snapshot_version,
      "a".repeat(40)
    );

    assert.equal(
      receipt.proposed_action.action,
      "deploy_release"
    );

    assert.equal(
      receipt.approval_id,
      "approval-receipt-1"
    );

    assert.equal(
      receipt.approval_principal_id,
      "operator-receipt"
    );

    assert.equal(
      receipt.execution_configured,
      false
    );

    assert.equal(
      receipt.external_action_executed,
      false
    );

    assert.equal(
      verifyExecutionAuthorizationReceiptIntegrityV2(
        receipt
      ),
      true
    );
  }
);

test(
  "tampering with receipt material breaks receipt integrity",
  () => {
    const values =
      fixtures();

    const receipt =
      createExecutionAuthorizationReceiptV2(
        values.session,
        values.preflightResponse,
        values.approvalRecord,
        {
          issuedAt:
            "2026-11-02T01:08:30Z"
        }
      );

    receipt.authorized_snapshot_version =
      "b".repeat(40);

    assert.equal(
      verifyExecutionAuthorizationReceiptIntegrityV2(
        receipt
      ),
      false
    );
  }
);

test(
  "receipt rejects a preflight bound to another lock",
  () => {
    const values =
      fixtures();

    const preflight =
      clone(
        values.preflightResponse
      );

    preflight.preflight
      .lock_fingerprint =
      "b".repeat(64);

    assert.throws(
      () =>
        createExecutionAuthorizationReceiptV2(
          values.session,
          preflight,
          values.approvalRecord
        ),
      (error) =>
        error instanceof
          ExecutionAuthorizationReceiptErrorV2 &&
        error.code ===
          "INVALID_PREFLIGHT"
    );
  }
);

test(
  "required approval cannot be omitted from execution receipt",
  () => {
    const values =
      fixtures();

    assert.throws(
      () =>
        createExecutionAuthorizationReceiptV2(
          values.session,
          values.preflightResponse,
          undefined
        ),
      (error) =>
        error instanceof
          ExecutionAuthorizationReceiptErrorV2 &&
        error.code ===
          "INVALID_APPROVAL"
    );
  }
);

test(
  "receipt lifetime never exceeds human approval lifetime",
  () => {
    const values =
      fixtures(
        "REQUIRED",
        3 * 60 * 1000
      );

    const receipt =
      createExecutionAuthorizationReceiptV2(
        values.session,
        values.preflightResponse,
        values.approvalRecord,
        {
          issuedAt:
            "2026-11-02T01:08:30Z",

          ttlMs:
            10 * 60 * 1000
        }
      );

    assert.equal(
      receipt.expires_at,
      "2026-11-02T01:09:00.000Z"
    );
  }
);

test(
  "policy NONE can produce a receipt without human approval",
  () => {
    const values =
      fixtures(
        "NONE"
      );

    const receipt =
      createExecutionAuthorizationReceiptV2(
        values.session,
        values.preflightResponse,
        undefined,
        {
          issuedAt:
            "2026-11-02T01:08:30Z"
        }
      );

    assert.equal(
      receipt.approval_requirement,
      "NONE"
    );

    assert.equal(
      receipt.approval_id,
      undefined
    );

    assert.equal(
      verifyExecutionAuthorizationReceiptIntegrityV2(
        receipt
      ),
      true
    );
  }
);

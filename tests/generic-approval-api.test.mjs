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
  evaluateGenericAuthorizationApiV2
} from "../dist/api/v2/authorization.js";

import {
  AuthorizationSessionStoreErrorV2,
  AuthorizationSessionStoreV2
} from "../dist/api/v2/session-store.js";

import {
  AuthorizationApprovalStoreV2
} from "../dist/api/v2/approval-store.js";

import {
  GenericApprovalApiErrorV2,
  applyGenericApprovalApiV2
} from "../dist/api/v2/approval.js";

function authorizationResponse(
  humanApproval =
    "REQUIRED"
) {
  const subject = {
    provider:
      "stripe",

    resource_type:
      "payment",

    resource_id:
      "pi_approval"
  };

  const request = {
    request_id:
      `req-approval-${humanApproval}`,

    subject,

    snapshot: {
      snapshot_id:
        "payment-v1",

      subject,

      version:
        "state-v1",

      observed_at:
        "2026-11-02T00:00:00Z"
    },

    proposed_action: {
      namespace:
        "stripe",

      action:
        "refund_payment",

      parameters: {
        amount:
          2500
      }
    },

    policy: {
      policy_id:
        "refund-policy",

      version:
        "1.0.0",

      name:
        "Refund policy",

      objective:
        "Verify refund authorization.",

      decision_rules: [
        "Payment must remain refundable."
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
        "worker-approval",

      guard_agent_id:
        "guard-approval",

      tool_scope: [
        "stripe.read"
      ]
    },

    requested_at:
      "2026-11-02T00:01:00Z"
  };

  const evidence = {
    protocol_version:
      "2",

    request_digest:
      authorizationRequestDigest(
        request
      ),

    assembled_at:
      "2026-11-02T00:02:00Z",

    evidence: [
      {
        evidence_id:
          "E1",

        source_snapshot: {
          snapshot_id:
            "payment-read",

          subject,

          version:
            "state-v1",

          observed_at:
            "2026-11-02T00:01:30Z"
        },

        locator:
          "stripe.payment",

        observation:
          "Payment remains refundable.",

        level:
          "OUTPUT_OBSERVED"
      }
    ],

    claims: [
      {
        claim_id:
          "C1",

        statement:
          "Payment remains refundable.",

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
      0.95,

    summary:
      "Payment remains refundable.",

    assessed_at:
      "2026-11-02T00:03:00Z"
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
      "Worker decision is independently supported.",

    verified_at:
      "2026-11-02T00:04:00Z"
  };

  return evaluateGenericAuthorizationApiV2(
    {
      request,
      evidence,

      worker_assessment:
        worker,

      guard_verification:
        guard
    },
    {
      intentId:
        `intent-${humanApproval}`,

      lockId:
        `lock-${humanApproval}`,

      lockCreatedAt:
        "2026-11-02T00:05:00Z"
    }
  );
}

function stores(
  humanApproval =
    "REQUIRED"
) {
  const sessions =
    new AuthorizationSessionStoreV2({
      now: () =>
        new Date(
          "2026-11-02T00:06:00Z"
        ),

      ttlMs:
        15 * 60 * 1000
    });

  const approvals =
    new AuthorizationApprovalStoreV2();

  const session =
    sessions.create(
      authorizationResponse(
        humanApproval
      ),
      {
        sessionId:
          `session-${humanApproval}`,

        createdAt:
          "2026-11-02T00:06:00Z"
      }
    );

  return {
    sessions,
    approvals,
    session
  };
}

const principal = {
  principal_type:
    "HUMAN",

  principal_id:
    "operator-123",

  display_name:
    "Security Operator",

  authentication_method:
    "authenticated-server-session"
};

const approvalOptions = {
  approvalId:
    "approval-v2",

  decidedAt:
    "2026-11-02T00:07:00Z",

  ttlMs:
    10 * 60 * 1000
};

test(
  "authenticated server principal can approve the exact stored session lock",
  () => {
    const {
      sessions,
      approvals,
      session
    } = stores();

    const result =
      applyGenericApprovalApiV2(
        {
          session_id:
            session.session_id,

          decision:
            "APPROVED"
        },
        principal,
        sessions,
        approvals,
        approvalOptions
      );

    assert.equal(
      result.status,
      "READY_FOR_PREFLIGHT"
    );

    assert.equal(
      result.next_step,
      "RUN_PREFLIGHT"
    );

    assert.equal(
      result.external_action_executed,
      false
    );

    const stored =
      approvals.get(
        sessions.get(
          session.session_id
        )
      );

    assert.equal(
      stored.attestation.decision,
      "APPROVED"
    );

    assert.equal(
      stored.attestation
        .lock_fingerprint,
      session.lock_fingerprint
    );
  }
);

test(
  "human rejection stops the authorization",
  () => {
    const {
      sessions,
      approvals,
      session
    } = stores();

    const result =
      applyGenericApprovalApiV2(
        {
          session_id:
            session.session_id,

          decision:
            "REJECTED"
        },
        principal,
        sessions,
        approvals,
        {
          approvalId:
            "rejection-v2",

          decidedAt:
            "2026-11-02T00:07:00Z"
        }
      );

    assert.equal(
      result.status,
      "REJECTED_BY_HUMAN"
    );

    assert.equal(
      result.next_step,
      "STOP"
    );

    assert.equal(
      "approval_expires_at"
        in result.approval,
      false
    );
  }
);

test(
  "browser body cannot inject principal identity",
  () => {
    const {
      sessions,
      approvals,
      session
    } = stores();

    assert.throws(
      () =>
        applyGenericApprovalApiV2(
          {
            session_id:
              session.session_id,

            decision:
              "APPROVED",

            principal_id:
              "attacker"
          },
          principal,
          sessions,
          approvals,
          approvalOptions
        ),
      (error) =>
        error instanceof
          GenericApprovalApiErrorV2 &&
        error.code ===
          "UNSUPPORTED_FIELD"
    );
  }
);

test(
  "approval API rejects a principal without authentication metadata",
  () => {
    const {
      sessions,
      approvals,
      session
    } = stores();

    assert.throws(
      () =>
        applyGenericApprovalApiV2(
          {
            session_id:
              session.session_id,

            decision:
              "APPROVED"
          },
          {
            principal_type:
              "HUMAN",

            principal_id:
              "operator-123"
          },
          sessions,
          approvals,
          approvalOptions
        ),
      (error) =>
        error instanceof
          GenericApprovalApiErrorV2 &&
        error.code ===
          "UNAUTHENTICATED_PRINCIPAL"
    );
  }
);

test(
  "same session cannot receive two human decisions",
  () => {
    const {
      sessions,
      approvals,
      session
    } = stores();

    applyGenericApprovalApiV2(
      {
        session_id:
          session.session_id,

        decision:
          "APPROVED"
      },
      principal,
      sessions,
      approvals,
      approvalOptions
    );

    assert.throws(
      () =>
        applyGenericApprovalApiV2(
          {
            session_id:
              session.session_id,

            decision:
              "REJECTED"
          },
          principal,
          sessions,
          approvals,
          {
            approvalId:
              "approval-second",

            decidedAt:
              "2026-11-02T00:08:00Z"
          }
        ),
      (error) =>
        error instanceof
          GenericApprovalApiErrorV2 &&
        error.code ===
          "ALREADY_DECIDED"
    );
  }
);

test(
  "policy NONE cannot enter the human approval endpoint",
  () => {
    const {
      sessions,
      approvals,
      session
    } = stores(
      "NONE"
    );

    assert.equal(
      session.session_state,
      "READY_FOR_PREFLIGHT"
    );

    assert.throws(
      () =>
        applyGenericApprovalApiV2(
          {
            session_id:
              session.session_id,

            decision:
              "APPROVED"
          },
          principal,
          sessions,
          approvals,
          approvalOptions
        ),
      (error) =>
        error instanceof
          GenericApprovalApiErrorV2 &&
        error.code ===
          "INVALID_SESSION_STATE"
    );
  }
);

test(
  "unknown authorization session fails closed",
  () => {
    const {
      sessions,
      approvals
    } = stores();

    assert.throws(
      () =>
        applyGenericApprovalApiV2(
          {
            session_id:
              "does-not-exist",

            decision:
              "APPROVED"
          },
          principal,
          sessions,
          approvals,
          approvalOptions
        ),
      (error) =>
        error instanceof
          AuthorizationSessionStoreErrorV2 &&
        error.code ===
          "NOT_FOUND"
    );
  }
);

test(
  "decision cannot be recorded after session expiration time",
  () => {
    const {
      sessions,
      approvals,
      session
    } = stores();

    assert.throws(
      () =>
        applyGenericApprovalApiV2(
          {
            session_id:
              session.session_id,

            decision:
              "APPROVED"
          },
          principal,
          sessions,
          approvals,
          {
            approvalId:
              "approval-too-late",

            decidedAt:
              "2026-11-02T00:21:00Z"
          }
        ),
      (error) =>
        error instanceof
          GenericApprovalApiErrorV2 &&
        error.code ===
          "INVALID_SESSION_STATE"
    );
  }
);

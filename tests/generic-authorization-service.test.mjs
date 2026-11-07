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
  AuthorizationSessionStoreErrorV2,
  AuthorizationSessionStoreV2
} from "../dist/api/v2/session-store.js";

import {
  GenericApprovalApiErrorV2
} from "../dist/api/v2/approval.js";

import {
  GenericAuthorizationServiceErrorV2,
  GenericAuthorizationServiceV2
} from "../dist/api/v2/service.js";

import {
  GenericPreflightError
} from "../dist/core/preflight.js";

import {
  SnapshotResolverRegistryV2
} from "../dist/core/snapshot-resolver.js";

function buildPipeline({
  humanApproval =
    "REQUIRED",

  workerDecision =
    "READY"
} = {}) {
  const subject = {
    provider:
      "stripe",

    resource_type:
      "payment",

    resource_id:
      "pi_service"
  };

  const request = {
    request_id:
      `req-service-${humanApproval}-${workerDecision}`,

    subject,

    snapshot: {
      snapshot_id:
        "payment-state-v1",

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
        "service-refund-policy",

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
        "worker-service",

      guard_agent_id:
        "guard-service",

      tool_scope: [
        "stripe.read"
      ]
    },

    requested_at:
      "2026-11-02T00:01:00Z"
  };

  const claimStatus =
    workerDecision ===
      "READY"
      ? "SUPPORTED"
      : "UNKNOWN";

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
          "Payment state was observed.",

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
          claimStatus,

        evidence_refs:
          claimStatus ===
            "SUPPORTED"
            ? ["E1"]
            : []
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
      workerDecision,

    confidence:
      workerDecision ===
        "READY"
        ? 0.95
        : 0.5,

    summary:
      workerDecision ===
        "READY"
        ? "Payment remains refundable."
        : "Refundability remains unknown.",

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

    verified_claims:
      workerDecision ===
        "READY"
        ? ["C1"]
        : [],

    unverified_claims:
      workerDecision ===
        "UNKNOWN"
        ? ["C1"]
        : [],

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
      workerDecision ===
        "READY"
        ? "READY assessment is independently supported."
        : "UNKNOWN assessment is independently supported.",

    verified_at:
      "2026-11-02T00:04:00Z"
  };

  return {
    request,
    evidence,

    worker_assessment:
      worker,

    guard_verification:
      guard
  };
}

function service() {
  return new GenericAuthorizationServiceV2({
    sessionStore:
      new AuthorizationSessionStoreV2({
        now: () =>
          new Date(
            "2026-11-02T00:06:00Z"
          ),

        ttlMs:
          15 * 60 * 1000,

        capacity:
          20
      })
  });
}

function authorizeOptions(
  suffix =
    "required"
) {
  return {
    intentId:
      `intent-service-${suffix}`,

    lockId:
      `lock-service-${suffix}`,

    lockCreatedAt:
      "2026-11-02T00:05:00Z",

    sessionId:
      `session-service-${suffix}`,

    sessionCreatedAt:
      "2026-11-02T00:06:00Z"
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

test(
  "required approval authorization automatically creates a resumable server session",
  () => {
    const app =
      service();

    const result =
      app.authorize(
        buildPipeline(),
        authorizeOptions()
      );

    assert.equal(
      result.status,
      "AWAITING_HUMAN_APPROVAL"
    );

    assert.equal(
      result.next_step,
      "COLLECT_HUMAN_APPROVAL"
    );

    assert.equal(
      result.session.session_state,
      "AWAITING_HUMAN_APPROVAL"
    );

    assert.equal(
      app.session(
        result.session.session_id
      ).lock_fingerprint,
      result.lock.fingerprint
    );

    assert.equal(
      result.external_action_executed,
      false
    );
  }
);

test(
  "policy NONE creates a server session already ready for preflight",
  () => {
    const app =
      service();

    const result =
      app.authorize(
        buildPipeline({
          humanApproval:
            "NONE"
        }),
        authorizeOptions(
          "none"
        )
      );

    assert.equal(
      result.status,
      "AUTHORIZED_BY_POLICY"
    );

    assert.equal(
      result.next_step,
      "RUN_PREFLIGHT"
    );

    assert.equal(
      result.session.session_state,
      "READY_FOR_PREFLIGHT"
    );
  }
);

test(
  "terminal UNKNOWN decision does not create a resumable session",
  () => {
    const app =
      service();

    const result =
      app.authorize(
        buildPipeline({
          workerDecision:
            "UNKNOWN"
        }),
        authorizeOptions(
          "unknown"
        )
      );

    assert.equal(
      result.status,
      "STOPPED_UNKNOWN"
    );

    assert.equal(
      result.next_step,
      "STOP"
    );

    assert.equal(
      result.session,
      undefined
    );

    assert.equal(
      app.sessions.size(),
      0
    );
  }
);

test(
  "approval resumes the exact server-side session and stores its attestation",
  () => {
    const app =
      service();

    const authorization =
      app.authorize(
        buildPipeline(),
        authorizeOptions()
      );

    const approval =
      app.approve(
        {
          session_id:
            authorization
              .session
              .session_id,

          decision:
            "APPROVED"
        },
        principal,
        {
          approvalId:
            "approval-service",

          decidedAt:
            "2026-11-02T00:07:00Z",

          ttlMs:
            10 * 60 * 1000
        }
      );

    assert.equal(
      approval.status,
      "READY_FOR_PREFLIGHT"
    );

    const stored =
      app.approval(
        authorization
          .session
          .session_id
      );

    assert.equal(
      stored.attestation
        .lock_fingerprint,
      authorization
        .lock
        .fingerprint
    );

    assert.equal(
      stored.attestation
        .principal
        .principal_id,
      "operator-123"
    );

    assert.equal(
      approval.external_action_executed,
      false
    );
  }
);

test(
  "service rejects replaying another human decision on the same session",
  () => {
    const app =
      service();

    const authorization =
      app.authorize(
        buildPipeline(),
        authorizeOptions()
      );

    const body = {
      session_id:
        authorization.session
          .session_id,

      decision:
        "APPROVED"
    };

    app.approve(
      body,
      principal,
      {
        approvalId:
          "approval-first",

        decidedAt:
          "2026-11-02T00:07:00Z"
      }
    );

    assert.throws(
      () =>
        app.approve(
          {
            ...body,

            decision:
              "REJECTED"
          },
          principal,
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
  "a fresh service instance cannot resume an in-memory session after restart",
  () => {
    const beforeRestart =
      service();

    const authorization =
      beforeRestart.authorize(
        buildPipeline(),
        authorizeOptions()
      );

    const afterRestart =
      service();

    assert.throws(
      () =>
        afterRestart.approve(
          {
            session_id:
              authorization
                .session
                .session_id,

            decision:
              "APPROVED"
          },
          principal,
          {
            approvalId:
              "approval-after-restart",

            decidedAt:
              "2026-11-02T00:07:00Z"
          }
        ),
      (error) =>
        error instanceof
          AuthorizationSessionStoreErrorV2 &&
        error.code ===
          "NOT_FOUND"
    );
  }
);

function preflightService(
  version =
    "state-v1"
) {
  const registry =
    new SnapshotResolverRegistryV2();

  registry.register({
    resolver_version:
      "2",

    resolver_id:
      "stripe.service-test",

    provider:
      "stripe",

    supports(subject) {
      return (
        subject.resource_type ===
          "payment"
      );
    },

    async resolve(subject) {
      return {
        snapshot_id:
          "fresh-service-snapshot",

        subject:
          JSON.parse(
            JSON.stringify(
              subject
            )
          ),

        version,

        observed_at:
          "2026-11-02T00:08:00Z"
      };
    }
  });

  return new GenericAuthorizationServiceV2({
    sessionStore:
      new AuthorizationSessionStoreV2({
        now: () =>
          new Date(
            "2026-11-02T00:06:00Z"
          ),

        ttlMs:
          15 * 60 * 1000,

        capacity:
          20
      }),

    preflightResolverRegistry:
      registry,

    preflightContextProvider: {
      async getCurrentContext(
        session
      ) {
        const request =
          session.lock
            .intent
            .request;

        return {
          proposed_action:
            JSON.parse(
              JSON.stringify(
                request.proposed_action
              )
            ),

          policy:
            JSON.parse(
              JSON.stringify(
                request.policy
              )
            ),

          runtime:
            JSON.parse(
              JSON.stringify(
                request.runtime
              )
            )
        };
      }
    }
  });
}

test(
  "stateful service continues approved authorization through verified preflight",
  async () => {
    const app =
      preflightService();

    const authorization =
      app.authorize(
        buildPipeline(),
        authorizeOptions(
          "preflight"
        )
      );

    app.approve(
      {
        session_id:
          authorization
            .session
            .session_id,

        decision:
          "APPROVED"
      },
      principal,
      {
        approvalId:
          "approval-preflight",

        decidedAt:
          "2026-11-02T00:07:00Z",

        ttlMs:
          10 * 60 * 1000
      }
    );

    const result =
      await app.preflight(
        {
          session_id:
            authorization
              .session
              .session_id
        },
        {
          checkedAt:
            "2026-11-02T00:09:00Z"
        }
      );

    assert.equal(
      result.status,
      "AUTHORIZED_FOR_EXECUTOR"
    );

    assert.equal(
      result.preflight.status,
      "PRE_EXECUTION_VERIFIED"
    );

    assert.equal(
      result.preflight
        .approval_verified,
      true
    );

    assert.equal(
      result.external_action_executed,
      false
    );
  }
);

test(
  "policy NONE continues directly through service preflight",
  async () => {
    const app =
      preflightService();

    const authorization =
      app.authorize(
        buildPipeline({
          humanApproval:
            "NONE"
        }),
        authorizeOptions(
          "preflight-none"
        )
      );

    const result =
      await app.preflight(
        {
          session_id:
            authorization
              .session
              .session_id
        },
        {
          checkedAt:
            "2026-11-02T00:09:00Z"
        }
      );

    assert.equal(
      result.status,
      "AUTHORIZED_FOR_EXECUTOR"
    );

    assert.equal(
      result.preflight
        .approval_requirement,
      "NONE"
    );
  }
);

test(
  "service fails closed when preflight dependencies are not configured",
  async () => {
    const app =
      service();

    await assert.rejects(
      app.preflight({
        session_id:
          "any-session"
      }),
      (error) =>
        error instanceof
          GenericAuthorizationServiceErrorV2 &&
        error.code ===
          "PREFLIGHT_NOT_CONFIGURED"
    );
  }
);

test(
  "stateful service propagates fresh resource drift as a preflight failure",
  async () => {
    const app =
      preflightService(
        "state-v2"
      );

    const authorization =
      app.authorize(
        buildPipeline(),
        authorizeOptions(
          "preflight-drift"
        )
      );

    app.approve(
      {
        session_id:
          authorization
            .session
            .session_id,

        decision:
          "APPROVED"
      },
      principal,
      {
        approvalId:
          "approval-drift",

        decidedAt:
          "2026-11-02T00:07:00Z"
      }
    );

    await assert.rejects(
      app.preflight(
        {
          session_id:
            authorization
              .session
              .session_id
        },
        {
          checkedAt:
            "2026-11-02T00:09:00Z"
        }
      ),
      (error) =>
        error instanceof
          GenericPreflightError &&
        error.code ===
          "SNAPSHOT_CHANGED"
    );
  }
);

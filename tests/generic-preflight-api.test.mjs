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
  GenericPreflightError
} from "../dist/core/preflight.js";

import {
  SnapshotResolverRegistryV2
} from "../dist/core/snapshot-resolver.js";

import {
  evaluateGenericAuthorizationApiV2
} from "../dist/api/v2/authorization.js";

import {
  AuthorizationSessionStoreV2
} from "../dist/api/v2/session-store.js";

import {
  AuthorizationApprovalStoreV2
} from "../dist/api/v2/approval-store.js";

import {
  applyGenericApprovalApiV2
} from "../dist/api/v2/approval.js";

import {
  GenericPreflightApiErrorV2,
  runGenericPreflightApiV2
} from "../dist/api/v2/preflight.js";

function buildAuthorization(
  humanApproval =
    "REQUIRED"
) {
  const subject = {
    provider:
      "stripe",

    resource_type:
      "payment",

    resource_id:
      "pi_preflight"
  };

  const request = {
    request_id:
      `req-preflight-${humanApproval}`,

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
        "Verify refund before execution.",

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
        "worker-preflight",

      guard_agent_id:
        "guard-preflight",

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

    verified_claims:
      ["C1"],

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
      "READY assessment is independently supported.",

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
        `intent-preflight-${humanApproval}`,

      lockId:
        `lock-preflight-${humanApproval}`,

      lockCreatedAt:
        "2026-11-02T00:05:00Z"
    }
  );
}

function setup(
  humanApproval =
    "REQUIRED"
) {
  const sessions =
    new AuthorizationSessionStoreV2({
      now: () =>
        new Date(
          "2026-11-02T00:06:00Z"
        )
    });

  const approvals =
    new AuthorizationApprovalStoreV2();

  const session =
    sessions.create(
      buildAuthorization(
        humanApproval
      ),
      {
        sessionId:
          `session-preflight-${humanApproval}`,

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

function registry(
  version =
    "state-v1"
) {
  const value =
    new SnapshotResolverRegistryV2();

  value.register({
    resolver_version:
      "2",

    resolver_id:
      "stripe.test",

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
          "fresh-payment-read",

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

  return value;
}

function currentContextProvider(
  mutate = (
    context
  ) => context
) {
  return {
    async getCurrentContext(
      session
    ) {
      const request =
        session.lock
          .intent
          .request;

      const context = {
        proposed_action:
          JSON.parse(
            JSON.stringify(
              request
                .proposed_action
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

      return mutate(
        context
      );
    }
  };
}

function approve(
  sessions,
  approvals,
  session,
  decision =
    "APPROVED"
) {
  return applyGenericApprovalApiV2(
    {
      session_id:
        session.session_id,

      decision
    },
    {
      principal_type:
        "HUMAN",

      principal_id:
        "operator-1",

      authentication_method:
        "authenticated-server-session"
    },
    sessions,
    approvals,
    {
      approvalId:
        `approval-${decision}`,

      decidedAt:
        "2026-11-02T00:07:00Z",

      ttlMs:
        10 * 60 * 1000
    }
  );
}

test(
  "approved session is independently re-resolved and authorized for executor",
  async () => {
    const {
      sessions,
      approvals,
      session
    } = setup();

    approve(
      sessions,
      approvals,
      session
    );

    const result =
      await runGenericPreflightApiV2(
        {
          session_id:
            session.session_id
        },
        sessions,
        approvals,
        registry(),
        currentContextProvider(),
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
      result.next_step,
      "TRUSTED_EXECUTOR"
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
  "policy NONE can preflight without an approval record",
  async () => {
    const {
      sessions,
      approvals,
      session
    } = setup(
      "NONE"
    );

    const result =
      await runGenericPreflightApiV2(
        {
          session_id:
            session.session_id
        },
        sessions,
        approvals,
        registry(),
        currentContextProvider(),
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
  "required approval cannot be skipped",
  async () => {
    const {
      sessions,
      approvals,
      session
    } = setup();

    await assert.rejects(
      runGenericPreflightApiV2(
        {
          session_id:
            session.session_id
        },
        sessions,
        approvals,
        registry(),
        currentContextProvider(),
        {
          checkedAt:
            "2026-11-02T00:09:00Z"
        }
      ),
      (error) =>
        error instanceof
          GenericPreflightError &&
        error.code ===
          "APPROVAL_REQUIRED"
    );
  }
);

test(
  "explicit human rejection cannot reach executor authorization",
  async () => {
    const {
      sessions,
      approvals,
      session
    } = setup();

    approve(
      sessions,
      approvals,
      session,
      "REJECTED"
    );

    await assert.rejects(
      runGenericPreflightApiV2(
        {
          session_id:
            session.session_id
        },
        sessions,
        approvals,
        registry(),
        currentContextProvider(),
        {
          checkedAt:
            "2026-11-02T00:09:00Z"
        }
      ),
      (error) =>
        error instanceof
          GenericPreflightError &&
        error.code ===
          "APPROVAL_REJECTED"
    );
  }
);

test(
  "resource drift after approval is blocked",
  async () => {
    const {
      sessions,
      approvals,
      session
    } = setup();

    approve(
      sessions,
      approvals,
      session
    );

    await assert.rejects(
      runGenericPreflightApiV2(
        {
          session_id:
            session.session_id
        },
        sessions,
        approvals,
        registry(
          "state-v2"
        ),
        currentContextProvider(),
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

test(
  "trusted current action drift is blocked",
  async () => {
    const {
      sessions,
      approvals,
      session
    } = setup();

    approve(
      sessions,
      approvals,
      session
    );

    await assert.rejects(
      runGenericPreflightApiV2(
        {
          session_id:
            session.session_id
        },
        sessions,
        approvals,
        registry(),
        currentContextProvider(
          (context) => {
            context
              .proposed_action
              .parameters
              .amount =
              9999;

            return context;
          }
        ),
        {
          checkedAt:
            "2026-11-02T00:09:00Z"
        }
      ),
      (error) =>
        error instanceof
          GenericPreflightError &&
        error.code ===
          "ACTION_CHANGED"
    );
  }
);

test(
  "client cannot inject snapshot action policy or runtime into preflight body",
  async () => {
    const {
      sessions,
      approvals,
      session
    } = setup();

    await assert.rejects(
      runGenericPreflightApiV2(
        {
          session_id:
            session.session_id,

          snapshot: {
            version:
              "attacker"
          }
        },
        sessions,
        approvals,
        registry(),
        currentContextProvider()
      ),
      (error) =>
        error instanceof
          GenericPreflightApiErrorV2 &&
        error.code ===
          "UNSUPPORTED_FIELD"
    );
  }
);

test(
  "trusted current execution context failure blocks preflight",
  async () => {
    const {
      sessions,
      approvals,
      session
    } = setup();

    approve(
      sessions,
      approvals,
      session
    );

    await assert.rejects(
      runGenericPreflightApiV2(
        {
          session_id:
            session.session_id
        },
        sessions,
        approvals,
        registry(),
        {
          async getCurrentContext() {
            throw new Error(
              "executor state unavailable"
            );
          }
        },
        {
          checkedAt:
            "2026-11-02T00:09:00Z"
        }
      ),
      (error) =>
        error instanceof
          GenericPreflightApiErrorV2 &&
        error.code ===
          "CURRENT_CONTEXT_UNAVAILABLE"
    );
  }
);

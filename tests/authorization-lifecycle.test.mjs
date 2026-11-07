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
  AuthorizationLifecycleErrorV2,
  runAuthorizationLifecycleV2
} from "../dist/core/authorization-lifecycle.js";

import {
  InMemoryApprovalProviderV2
} from "../dist/approvals/in-memory.js";

import {
  InMemoryAuditSinkV2
} from "../dist/audit/in-memory.js";

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

function buildPipeline({
  workerDecision =
    "READY",

  guardVerdict =
    "PASS",

  humanApproval =
    "REQUIRED"
} = {}) {
  const subject = {
    provider:
      "stripe",

    resource_type:
      "payment",

    resource_id:
      "pi_123"
  };

  const request = {
    request_id:
      "req-lifecycle",

    subject,

    snapshot: {
      snapshot_id:
        "payment-v7",

      subject,

      version:
        "state-v7",

      observed_at:
        "2026-11-01T21:00:00Z"
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
        "refund-safety",

      version:
        "1.0.0",

      name:
        "Refund safety",

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
        "worker-1",

      guard_agent_id:
        "guard-1",

      tool_scope: [
        "stripe.read"
      ]
    },

    requested_at:
      "2026-11-01T21:01:00Z"
  };

  const claimStatus =
    workerDecision ===
      "UNKNOWN"
      ? "UNKNOWN"
      : "SUPPORTED";

  const evidenceRefs =
    claimStatus ===
      "SUPPORTED"
      ? ["E1"]
      : [];

  const evidence = {
    protocol_version:
      "2",

    request_digest:
      authorizationRequestDigest(
        request
      ),

    assembled_at:
      "2026-11-01T21:02:00Z",

    evidence: [
      {
        evidence_id:
          "E1",

        source_snapshot: {
          snapshot_id:
            "payment-read",

          subject,

          version:
            "state-v7",

          observed_at:
            "2026-11-01T21:01:30Z"
        },

        locator:
          "stripe.payment.pi_123",

        observation:
          "Payment exists.",

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
          evidenceRefs
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
        "UNKNOWN"
        ? 0.5
        : 0.9,

    summary:
      workerDecision ===
        "UNKNOWN"
        ? "Refundability remains unknown."
        : "Refundability is supported.",

    assessed_at:
      "2026-11-01T21:03:00Z"
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
      guardVerdict,

    risk:
      guardVerdict ===
        "FAIL"
        ? "CRITICAL"
        : guardVerdict ===
            "REVIEW"
          ? "MEDIUM"
          : "LOW",

    verified_claims:
      claimStatus ===
        "SUPPORTED"
        ? ["C1"]
        : [],

    unverified_claims:
      claimStatus ===
        "UNKNOWN"
        ? ["C1"]
        : [],

    contradicted_claims:
      [],

    findings:
      guardVerdict ===
        "PASS"
        ? []
        : [
            {
              finding_id:
                "F1",

              type:
                guardVerdict ===
                  "FAIL"
                  ? "EVIDENCE_INTEGRITY_FAILURE"
                  : "MISSING_EVIDENCE",

              severity:
                guardVerdict ===
                  "FAIL"
                  ? "CRITICAL"
                  : "MEDIUM",

              claim_id:
                "C1",

              description:
                guardVerdict ===
                  "FAIL"
                  ? "Material evidence integrity failure."
                  : "Required evidence is missing.",

              required_check:
                guardVerdict ===
                  "REVIEW"
                  ? "Read the current refundability state."
                  : null
            }
          ],

    requested_checks:
      guardVerdict ===
        "REVIEW"
        ? [
            {
              finding_id:
                "F1",

              check:
                "Read the current refundability state."
            }
          ]
        : [],

    worker_decision_supported:
      guardVerdict ===
        "PASS",

    retry_recommended:
      guardVerdict ===
        "REVIEW",

    summary:
      guardVerdict ===
        "PASS"
        ? "Worker decision is independently supported."
        : guardVerdict ===
            "REVIEW"
          ? "Targeted evidence recovery is required."
          : "Material verification failure.",

    verified_at:
      "2026-11-01T21:04:00Z"
  };

  return {
    request,
    evidence,
    worker,
    guard
  };
}

function resolverRegistry(
  version =
    "state-v7",
  onResolve
) {
  const registry =
    new SnapshotResolverRegistryV2();

  registry.register({
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
      if (onResolve) {
        onResolve(
          subject
        );
      }

      return {
        snapshot_id:
          "fresh-payment",

        subject:
          clone(subject),

        version,

        observed_at:
          "2026-11-01T21:07:30Z"
      };
    }
  });

  return registry;
}

function currentContext(
  values
) {
  return {
    proposed_action:
      clone(
        values.request
          .proposed_action
      ),

    policy:
      clone(
        values.request
          .policy
      ),

    runtime:
      clone(
        values.request
          .runtime
      )
  };
}

function approvalProvider(
  decision =
    "APPROVED"
) {
  const provider =
    new InMemoryApprovalProviderV2({
      providerId:
        "memory.approval",

      now: () =>
        new Date(
          "2026-11-01T21:07:00Z"
        )
    });

  return {
    provider,

    submit(lock) {
      provider.submitDecision(
        lock,
        {
          principal_type:
            "HUMAN",

          principal_id:
            "operator-123",

          authentication_method:
            "authenticated-session"
        },
        decision
      );
    }
  };
}

const lifecycleOptions = {
  intentId:
    "intent-lifecycle",

  lockId:
    "lock-lifecycle",

  lockCreatedAt:
    "2026-11-01T21:05:00Z",

  approvalRequestedAt:
    "2026-11-01T21:06:00Z",

  approvalId:
    "approval-lifecycle",

  approvalTtlMs:
    10 * 60 * 1000,

  preflightCheckedAt:
    "2026-11-01T21:08:00Z"
};

test(
  "READY PASS required approval reaches AUTHORIZED_FOR_EXECUTOR without executing",
  async () => {
    const values =
      buildPipeline();

    const audit =
      new InMemoryAuditSinkV2();

    const approval =
      approvalProvider();

    const provider = {
      provider_version:
        "2",

      provider_id:
        "memory.wrapper",

      async requestDecision(
        challenge
      ) {
        return {
          decision_version:
            "2",

          provider_id:
            "memory.wrapper",

          lock_id:
            challenge.lock_id,

          lock_fingerprint:
            challenge
              .lock_fingerprint,

          principal: {
            principal_type:
              "HUMAN",

            principal_id:
              "operator-123",

            authentication_method:
              "authenticated-session"
          },

          decision:
            "APPROVED",

          decided_at:
            "2026-11-01T21:07:00Z"
        };
      }
    };

    const result =
      await runAuthorizationLifecycleV2({
        request:
          values.request,

        evidence:
          values.evidence,

        worker_assessment:
          values.worker,

        guard_verification:
          values.guard,

        current_context:
          currentContext(
            values
          ),

        resolver_registry:
          resolverRegistry(),

        audit_sink:
          audit,

        approval_provider:
          provider,

        options:
          lifecycleOptions
      });

    assert.equal(
      result.status,
      "AUTHORIZED_FOR_EXECUTOR"
    );

    assert.equal(
      result.execution_configured,
      false
    );

    assert.equal(
      result.external_action_executed,
      false
    );

    assert.equal(
      result.preflight.status,
      "PRE_EXECUTION_VERIFIED"
    );
  }
);

test(
  "successful lifecycle records the security stages in order",
  async () => {
    const values =
      buildPipeline();

    const audit =
      new InMemoryAuditSinkV2();

    const provider = {
      provider_version:
        "2",

      provider_id:
        "human.test",

      async requestDecision(
        challenge
      ) {
        return {
          decision_version:
            "2",

          provider_id:
            "human.test",

          lock_id:
            challenge.lock_id,

          lock_fingerprint:
            challenge
              .lock_fingerprint,

          principal: {
            principal_type:
              "HUMAN",

            principal_id:
              "operator",

            authentication_method:
              "session"
          },

          decision:
            "APPROVED",

          decided_at:
            "2026-11-01T21:07:00Z"
        };
      }
    };

    await runAuthorizationLifecycleV2({
      request:
        values.request,

      evidence:
        values.evidence,

      worker_assessment:
        values.worker,

      guard_verification:
        values.guard,

      current_context:
        currentContext(values),

      resolver_registry:
        resolverRegistry(),

      audit_sink:
        audit,

      approval_provider:
        provider,

      options:
        lifecycleOptions
    });

    const events =
      await audit.readAll();

    assert.deepEqual(
      events.map(
        (event) =>
          event.event_type
      ),
      [
        "authorization.decision",
        "action.locked",
        "approval.decided",
        "preflight.verified",
        "authorization.ready_for_executor"
      ]
    );
  }
);

test(
  "explicit human rejection stops before resource re-resolution",
  async () => {
    const values =
      buildPipeline();

    let resolverCalls =
      0;

    const provider = {
      provider_version:
        "2",

      provider_id:
        "human.reject",

      async requestDecision(
        challenge
      ) {
        return {
          decision_version:
            "2",

          provider_id:
            "human.reject",

          lock_id:
            challenge.lock_id,

          lock_fingerprint:
            challenge
              .lock_fingerprint,

          principal: {
            principal_type:
              "HUMAN",

            principal_id:
              "operator",

            authentication_method:
              "session"
          },

          decision:
            "REJECTED",

          decided_at:
            "2026-11-01T21:07:00Z"
        };
      }
    };

    const result =
      await runAuthorizationLifecycleV2({
        request:
          values.request,

        evidence:
          values.evidence,

        worker_assessment:
          values.worker,

        guard_verification:
          values.guard,

        current_context:
          currentContext(values),

        resolver_registry:
          resolverRegistry(
            "state-v7",
            () => {
              resolverCalls +=
                1;
            }
          ),

        audit_sink:
          new InMemoryAuditSinkV2(),

        approval_provider:
          provider,

        options:
          lifecycleOptions
      });

    assert.equal(
      result.status,
      "REJECTED_BY_HUMAN"
    );

    assert.equal(
      resolverCalls,
      0
    );

    assert.equal(
      result.external_action_executed,
      false
    );
  }
);

test(
  "required approval without provider fails closed before preflight",
  async () => {
    const values =
      buildPipeline();

    let resolverCalls =
      0;

    await assert.rejects(
      runAuthorizationLifecycleV2({
        request:
          values.request,

        evidence:
          values.evidence,

        worker_assessment:
          values.worker,

        guard_verification:
          values.guard,

        current_context:
          currentContext(values),

        resolver_registry:
          resolverRegistry(
            "state-v7",
            () => {
              resolverCalls +=
                1;
            }
          ),

        audit_sink:
          new InMemoryAuditSinkV2(),

        options:
          lifecycleOptions
      }),
      (error) =>
        error instanceof
          AuthorizationLifecycleErrorV2 &&
        error.code ===
          "APPROVAL_PROVIDER_REQUIRED"
    );

    assert.equal(
      resolverCalls,
      0
    );
  }
);

test(
  "UNKNOWN stops before lock approval and preflight",
  async () => {
    const values =
      buildPipeline({
        workerDecision:
          "UNKNOWN"
      });

    let resolverCalls =
      0;

    const result =
      await runAuthorizationLifecycleV2({
        request:
          values.request,

        evidence:
          values.evidence,

        worker_assessment:
          values.worker,

        guard_verification:
          values.guard,

        current_context:
          currentContext(values),

        resolver_registry:
          resolverRegistry(
            "state-v7",
            () => {
              resolverCalls +=
                1;
            }
          ),

        audit_sink:
          new InMemoryAuditSinkV2(),

        options:
          lifecycleOptions
      });

    assert.equal(
      result.status,
      "STOPPED_UNKNOWN"
    );

    assert.equal(
      result.lock,
      undefined
    );

    assert.equal(
      resolverCalls,
      0
    );
  }
);

test(
  "policy NONE reaches executor authorization without an approval provider",
  async () => {
    const values =
      buildPipeline({
        humanApproval:
          "NONE"
      });

    const result =
      await runAuthorizationLifecycleV2({
        request:
          values.request,

        evidence:
          values.evidence,

        worker_assessment:
          values.worker,

        guard_verification:
          values.guard,

        current_context:
          currentContext(values),

        resolver_registry:
          resolverRegistry(),

        audit_sink:
          new InMemoryAuditSinkV2(),

        options:
          lifecycleOptions
      });

    assert.equal(
      result.status,
      "AUTHORIZED_FOR_EXECUTOR"
    );

    assert.equal(
      result.approval,
      undefined
    );

    assert.equal(
      result.preflight
        .approval_verified,
      false
    );
  }
);

test(
  "policy OPTIONAL may proceed without explicit human approval",
  async () => {
    const values =
      buildPipeline({
        humanApproval:
          "OPTIONAL"
      });

    const result =
      await runAuthorizationLifecycleV2({
        request:
          values.request,

        evidence:
          values.evidence,

        worker_assessment:
          values.worker,

        guard_verification:
          values.guard,

        current_context:
          currentContext(values),

        resolver_registry:
          resolverRegistry(),

        audit_sink:
          new InMemoryAuditSinkV2(),

        options:
          lifecycleOptions
      });

    assert.equal(
      result.status,
      "AUTHORIZED_FOR_EXECUTOR"
    );

    assert.equal(
      result.approval,
      undefined
    );
  }
);

test(
  "post-approval snapshot drift blocks lifecycle",
  async () => {
    const values =
      buildPipeline();

    const provider = {
      provider_version:
        "2",

      provider_id:
        "human.test",

      async requestDecision(
        challenge
      ) {
        return {
          decision_version:
            "2",

          provider_id:
            "human.test",

          lock_id:
            challenge.lock_id,

          lock_fingerprint:
            challenge
              .lock_fingerprint,

          principal: {
            principal_type:
              "HUMAN",

            principal_id:
              "operator",

            authentication_method:
              "session"
          },

          decision:
            "APPROVED",

          decided_at:
            "2026-11-01T21:07:00Z"
        };
      }
    };

    await assert.rejects(
      runAuthorizationLifecycleV2({
        request:
          values.request,

        evidence:
          values.evidence,

        worker_assessment:
          values.worker,

        guard_verification:
          values.guard,

        current_context:
          currentContext(values),

        resolver_registry:
          resolverRegistry(
            "state-v8"
          ),

        audit_sink:
          new InMemoryAuditSinkV2(),

        approval_provider:
          provider,

        options:
          lifecycleOptions
      }),
      (error) =>
        error instanceof
          GenericPreflightError &&
        error.code ===
          "SNAPSHOT_CHANGED"
    );
  }
);

test(
  "post-lock action drift blocks lifecycle",
  async () => {
    const values =
      buildPipeline({
        humanApproval:
          "NONE"
      });

    const context =
      currentContext(values);

    context
      .proposed_action
      .parameters.amount =
      9999;

    await assert.rejects(
      runAuthorizationLifecycleV2({
        request:
          values.request,

        evidence:
          values.evidence,

        worker_assessment:
          values.worker,

        guard_verification:
          values.guard,

        current_context:
          context,

        resolver_registry:
          resolverRegistry(),

        audit_sink:
          new InMemoryAuditSinkV2(),

        options:
          lifecycleOptions
      }),
      (error) =>
        error instanceof
          GenericPreflightError &&
        error.code ===
          "ACTION_CHANGED"
    );
  }
);

test(
  "audit failure prevents successful authorization",
  async () => {
    const values =
      buildPipeline({
        humanApproval:
          "NONE"
      });

    const brokenAudit = {
      sink_version:
        "2",

      sink_id:
        "broken.audit",

      async append() {
        throw new Error(
          "audit unavailable"
        );
      },

      async readAll() {
        return [];
      },

      async checkpoint() {
        return {
          audit_version:
            "2",

          event_count:
            0,

          head_hash:
            null
        };
      }
    };

    await assert.rejects(
      runAuthorizationLifecycleV2({
        request:
          values.request,

        evidence:
          values.evidence,

        worker_assessment:
          values.worker,

        guard_verification:
          values.guard,

        current_context:
          currentContext(values),

        resolver_registry:
          resolverRegistry(),

        audit_sink:
          brokenAudit,

        options:
          lifecycleOptions
      }),
      /audit unavailable/
    );
  }
);

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
  verifyApprovalAttestationV2
} from "../dist/core/approval-attestation.js";

import {
  ApprovalProviderErrorV2,
  createApprovalChallengeV2,
  requestApprovalAttestationV2
} from "../dist/approvals/provider.js";

import {
  InMemoryApprovalProviderV2
} from "../dist/approvals/in-memory.js";

function buildLock(
  humanApproval =
    "REQUIRED"
) {
  const subject = {
    provider: "stripe",
    resource_type: "payment",
    resource_id: "pi_123"
  };

  const request = {
    request_id:
      "req-approval-provider",

    subject,

    snapshot: {
      snapshot_id:
        "payment-v7",

      subject,

      version:
        "state-v7",

      observed_at:
        "2026-11-01T20:00:00Z"
    },

    proposed_action: {
      namespace:
        "stripe",

      action:
        "refund_payment",

      parameters: {
        amount: 2500
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
      "2026-11-01T20:01:00Z"
  };

  const evidence = {
    protocol_version:
      "2",

    request_digest:
      authorizationRequestDigest(
        request
      ),

    assembled_at:
      "2026-11-01T20:02:00Z",

    evidence: [
      {
        evidence_id:
          "E1",

        source_snapshot: {
          snapshot_id:
            "payment-evidence",

          subject,

          version:
            "state-v7",

          observed_at:
            "2026-11-01T20:01:30Z"
        },

        locator:
          "stripe.payment.pi_123",

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

        evidence_refs:
          ["E1"]
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
      0.9,

    summary:
      "Required state is supported.",

    assessed_at:
      "2026-11-01T20:03:00Z"
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
      "Worker assessment is supported.",

    verified_at:
      "2026-11-01T20:04:00Z"
  };

  return createGenericActionLockV2(
    request,
    evidence,
    worker,
    guard,
    {
      intentId:
        "intent-provider",

      lockId:
        "lock-provider",

      createdAt:
        "2026-11-01T20:05:00Z"
    }
  );
}

function principal() {
  return {
    principal_type:
      "HUMAN",

    principal_id:
      "operator-123",

    display_name:
      "Operator",

    authentication_method:
      "authenticated-session"
  };
}

function provider() {
  return new InMemoryApprovalProviderV2({
    providerId:
      "memory.approval",

    now: () =>
      new Date(
        "2026-11-01T20:07:00Z"
      )
  });
}

test(
  "creates a detached approval challenge for the exact ActionLock",
  () => {
    const lock =
      buildLock();

    const challenge =
      createApprovalChallengeV2(
        provider(),
        lock,
        "2026-11-01T20:06:00Z"
      );

    assert.equal(
      challenge.lock_id,
      lock.lock_id
    );

    assert.equal(
      challenge.lock_fingerprint,
      lock.fingerprint
    );

    challenge
      .proposed_action
      .parameters.amount =
      9999;

    assert.equal(
      lock.intent
        .request
        .proposed_action
        .parameters.amount,
      2500
    );
  }
);

test(
  "in-memory provider creates a valid approved attestation",
  async () => {
    const lock =
      buildLock();

    const approvalProvider =
      provider();

    approvalProvider
      .submitDecision(
        lock,
        principal(),
        "APPROVED"
      );

    const attestation =
      await requestApprovalAttestationV2(
        approvalProvider,
        lock,
        {
          requestedAt:
            "2026-11-01T20:06:00Z",

          approvalId:
            "approval-provider",

          ttlMs:
            5 * 60 * 1000
        }
      );

    assert.equal(
      attestation.decision,
      "APPROVED"
    );

    assert.equal(
      attestation.principal
        .principal_id,
      "operator-123"
    );

    assert.equal(
      verifyApprovalAttestationV2(
        attestation,
        lock
      ),
      true
    );
  }
);

test(
  "provider rejection becomes a valid rejected attestation",
  async () => {
    const lock =
      buildLock();

    const approvalProvider =
      provider();

    approvalProvider
      .submitDecision(
        lock,
        principal(),
        "REJECTED"
      );

    const attestation =
      await requestApprovalAttestationV2(
        approvalProvider,
        lock,
        {
          requestedAt:
            "2026-11-01T20:06:00Z"
        }
      );

    assert.equal(
      attestation.decision,
      "REJECTED"
    );

    assert.equal(
      attestation
        .approval_expires_at,
      undefined
    );
  }
);

test(
  "human decision is consumed exactly once",
  async () => {
    const lock =
      buildLock();

    const approvalProvider =
      provider();

    approvalProvider
      .submitDecision(
        lock,
        principal(),
        "APPROVED"
      );

    await requestApprovalAttestationV2(
      approvalProvider,
      lock,
      {
        requestedAt:
          "2026-11-01T20:06:00Z"
      }
    );

    await assert.rejects(
      requestApprovalAttestationV2(
        approvalProvider,
        lock,
        {
          requestedAt:
            "2026-11-01T20:06:30Z"
        }
      ),
      (error) =>
        error instanceof
          ApprovalProviderErrorV2 &&
        error.code ===
          "PROVIDER_FAILED"
    );
  }
);

test(
  "duplicate pending decisions are rejected",
  () => {
    const lock =
      buildLock();

    const approvalProvider =
      provider();

    approvalProvider
      .submitDecision(
        lock,
        principal(),
        "APPROVED"
      );

    assert.throws(
      () =>
        approvalProvider
          .submitDecision(
            lock,
            principal(),
            "REJECTED"
          ),
      /already exists/
    );
  }
);

test(
  "unauthenticated human principal is rejected",
  () => {
    const lock =
      buildLock();

    assert.throws(
      () =>
        provider()
          .submitDecision(
            lock,
            {
              principal_type:
                "HUMAN",

              principal_id:
                "operator-123"
            },
            "APPROVED"
          ),
      /authenticated human principal/
    );
  }
);

test(
  "policy NONE rejects approval before provider interaction",
  async () => {
    const lock =
      buildLock(
        "NONE"
      );

    let calls = 0;

    const customProvider = {
      provider_version:
        "2",

      provider_id:
        "custom.approval",

      async requestDecision() {
        calls += 1;

        throw new Error(
          "must not run"
        );
      }
    };

    await assert.rejects(
      requestApprovalAttestationV2(
        customProvider,
        lock,
        {
          requestedAt:
            "2026-11-01T20:06:00Z"
        }
      ),
      (error) =>
        error instanceof
          ApprovalProviderErrorV2 &&
        error.code ===
          "APPROVAL_NOT_ALLOWED"
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "tampered ActionLock is rejected before provider interaction",
  async () => {
    const lock =
      buildLock();

    let calls = 0;

    const customProvider = {
      provider_version:
        "2",

      provider_id:
        "custom.approval",

      async requestDecision() {
        calls += 1;

        return {};
      }
    };

    lock.intent
      .request
      .proposed_action
      .parameters.amount =
      9999;

    await assert.rejects(
      requestApprovalAttestationV2(
        customProvider,
        lock,
        {
          requestedAt:
            "2026-11-01T20:06:00Z"
        }
      ),
      (error) =>
        error instanceof
          ApprovalProviderErrorV2 &&
        error.code ===
          "INVALID_LOCK"
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "provider cannot return a decision for another lock fingerprint",
  async () => {
    const lock =
      buildLock();

    const customProvider = {
      provider_version:
        "2",

      provider_id:
        "custom.approval",

      async requestDecision(
        challenge
      ) {
        return {
          decision_version:
            "2",

          provider_id:
            "custom.approval",

          lock_id:
            challenge.lock_id,

          lock_fingerprint:
            "0".repeat(64),

          principal:
            principal(),

          decision:
            "APPROVED",

          decided_at:
            "2026-11-01T20:07:00Z"
        };
      }
    };

    await assert.rejects(
      requestApprovalAttestationV2(
        customProvider,
        lock,
        {
          requestedAt:
            "2026-11-01T20:06:00Z"
        }
      ),
      (error) =>
        error instanceof
          ApprovalProviderErrorV2 &&
        error.code ===
          "LOCK_MISMATCH"
    );
  }
);

test(
  "provider cannot inject unsupported decision fields",
  async () => {
    const lock =
      buildLock();

    const customProvider = {
      provider_version:
        "2",

      provider_id:
        "custom.approval",

      async requestDecision(
        challenge
      ) {
        return {
          decision_version:
            "2",

          provider_id:
            "custom.approval",

          lock_id:
            challenge.lock_id,

          lock_fingerprint:
            challenge
              .lock_fingerprint,

          principal:
            principal(),

          decision:
            "APPROVED",

          decided_at:
            "2026-11-01T20:07:00Z",

          attestation_digest:
            "0".repeat(64)
        };
      }
    };

    await assert.rejects(
      requestApprovalAttestationV2(
        customProvider,
        lock,
        {
          requestedAt:
            "2026-11-01T20:06:00Z"
        }
      ),
      /unsupported field: attestation_digest/
    );
  }
);

test(
  "decision cannot predate the approval challenge",
  async () => {
    const lock =
      buildLock();

    const customProvider = {
      provider_version:
        "2",

      provider_id:
        "custom.approval",

      async requestDecision(
        challenge
      ) {
        return {
          decision_version:
            "2",

          provider_id:
            "custom.approval",

          lock_id:
            challenge.lock_id,

          lock_fingerprint:
            challenge
              .lock_fingerprint,

          principal:
            principal(),

          decision:
            "APPROVED",

          decided_at:
            "2026-11-01T20:05:30Z"
        };
      }
    };

    await assert.rejects(
      requestApprovalAttestationV2(
        customProvider,
        lock,
        {
          requestedAt:
            "2026-11-01T20:06:00Z"
        }
      ),
      (error) =>
        error instanceof
          ApprovalProviderErrorV2 &&
        error.code ===
          "INVALID_TIME"
    );
  }
);

test(
  "provider failure remains fail-closed",
  async () => {
    const lock =
      buildLock();

    const brokenProvider = {
      provider_version:
        "2",

      provider_id:
        "broken.approval",

      async requestDecision() {
        throw new Error(
          "identity service unavailable"
        );
      }
    };

    await assert.rejects(
      requestApprovalAttestationV2(
        brokenProvider,
        lock,
        {
          requestedAt:
            "2026-11-01T20:06:00Z"
        }
      ),
      (error) =>
        error instanceof
          ApprovalProviderErrorV2 &&
        error.code ===
          "PROVIDER_FAILED"
    );
  }
);

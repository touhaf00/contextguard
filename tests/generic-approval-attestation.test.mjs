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
  createApprovalAttestationV2,
  isApprovalAttestationActiveV2,
  verifyApprovalAttestationV2
} from "../dist/core/approval-attestation.js";

function createValues(
  humanApproval = "REQUIRED"
) {
  const request = {
    request_id:
      "req-approval-1",

    subject: {
      provider: "stripe",
      resource_type: "payment",
      resource_id: "pi_123"
    },

    snapshot: {
      snapshot_id:
        "payment-state-7",

      subject: {
        provider: "stripe",
        resource_type: "payment",
        resource_id: "pi_123"
      },

      version: "state-v7",

      observed_at:
        "2026-11-01T18:00:00Z"
    },

    proposed_action: {
      namespace: "stripe",
      action: "refund_payment",

      parameters: {
        amount: 2500,
        currency: "EUR"
      }
    },

    policy: {
      policy_id:
        "refund-safety",

      version: "1.0.0",

      name:
        "Refund safety",

      objective:
        "Verify refund conditions.",

      decision_rules: [
        "Payment must exist."
      ],

      human_approval:
        humanApproval,

      preflight_required:
        true
    },

    runtime: {
      platform: "cominty",

      worker_agent_id:
        "worker-1",

      guard_agent_id:
        "guard-1",

      tool_scope: [
        "stripe.read"
      ]
    },

    requested_at:
      "2026-11-01T18:01:00Z"
  };

  const evidence = {
    protocol_version: "2",

    request_digest:
      authorizationRequestDigest(
        request
      ),

    assembled_at:
      "2026-11-01T18:02:00Z",

    evidence: [
      {
        evidence_id: "E1",

        source_snapshot: {
          snapshot_id:
            "payment-state-7",

          subject: {
            provider: "stripe",
            resource_type: "payment",
            resource_id: "pi_123"
          },

          version:
            "state-v7",

          observed_at:
            "2026-11-01T18:01:30Z"
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
        claim_id: "C1",

        statement:
          "Payment exists.",

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
    protocol_version: "2",

    request_digest:
      authorizationRequestDigest(
        request
      ),

    evidence_digest:
      evidenceProtocolDigest(
        evidence,
        request
      ),

    decision: "READY",

    confidence: 0.9,

    summary:
      "Required conditions are supported.",

    assessed_at:
      "2026-11-01T18:03:00Z"
  };

  const guard = {
    protocol_version: "2",

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

    verdict: "PASS",
    risk: "LOW",

    verified_claims:
      ["C1"],

    unverified_claims:
      [],

    contradicted_claims:
      [],

    findings: [],
    requested_checks: [],

    worker_decision_supported:
      true,

    retry_recommended:
      false,

    summary:
      "Worker decision is supported.",

    verified_at:
      "2026-11-01T18:04:00Z"
  };

  const lock =
    createGenericActionLockV2(
      request,
      evidence,
      worker,
      guard,
      {
        intentId:
          "intent-approval-1",

        lockId:
          "lock-approval-1",

        createdAt:
          "2026-11-01T18:05:00Z"
      }
    );

  return {
    request,
    evidence,
    worker,
    guard,
    lock
  };
}

const principal = {
  principal_type:
    "HUMAN",

  principal_id:
    "operator-123",

  display_name:
    "ContextGuard Operator",

  authentication_method:
    "authenticated-session"
};

test(
  "creates a valid approval attestation for the exact ActionLock",
  () => {
    const { lock } =
      createValues();

    const attestation =
      createApprovalAttestationV2(
        lock,
        principal,
        "APPROVED",
        {
          approvalId:
            "approval-001",

          decidedAt:
            "2026-11-01T18:06:00Z",

          ttlMs:
            15 * 60 * 1000
        }
      );

    assert.equal(
      attestation.lock_id,
      lock.lock_id
    );

    assert.equal(
      attestation.lock_fingerprint,
      lock.fingerprint
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
  "approval attestation identifies the human principal",
  () => {
    const { lock } =
      createValues();

    const attestation =
      createApprovalAttestationV2(
        lock,
        principal,
        "APPROVED",
        {
          decidedAt:
            "2026-11-01T18:06:00Z"
        }
      );

    assert.equal(
      attestation
        .principal
        .principal_id,
      "operator-123"
    );
  }
);

test(
  "identical deterministic inputs produce a stable attestation digest",
  () => {
    const { lock } =
      createValues();

    const options = {
      approvalId:
        "approval-stable",

      decidedAt:
        "2026-11-01T18:06:00Z",

      ttlMs:
        60000
    };

    const first =
      createApprovalAttestationV2(
        lock,
        principal,
        "APPROVED",
        options
      );

    const second =
      createApprovalAttestationV2(
        lock,
        principal,
        "APPROVED",
        options
      );

    assert.equal(
      first.attestation_digest,
      second.attestation_digest
    );
  }
);

test(
  "changing the approving principal changes the attestation digest",
  () => {
    const { lock } =
      createValues();

    const options = {
      approvalId:
        "approval-principal",

      decidedAt:
        "2026-11-01T18:06:00Z"
    };

    const first =
      createApprovalAttestationV2(
        lock,
        principal,
        "APPROVED",
        options
      );

    const second =
      createApprovalAttestationV2(
        lock,
        {
          ...principal,
          principal_id:
            "different-operator"
        },
        "APPROVED",
        options
      );

    assert.notEqual(
      first.attestation_digest,
      second.attestation_digest
    );
  }
);

test(
  "tampering with principal identity invalidates the attestation",
  () => {
    const { lock } =
      createValues();

    const attestation =
      createApprovalAttestationV2(
        lock,
        principal,
        "APPROVED",
        {
          decidedAt:
            "2026-11-01T18:06:00Z"
        }
      );

    attestation
      .principal
      .principal_id =
      "attacker";

    assert.equal(
      verifyApprovalAttestationV2(
        attestation,
        lock
      ),
      false
    );
  }
);

test(
  "attestation cannot be replayed against another ActionLock fingerprint",
  () => {
    const first =
      createValues();

    const attestation =
      createApprovalAttestationV2(
        first.lock,
        principal,
        "APPROVED",
        {
          decidedAt:
            "2026-11-01T18:06:00Z"
        }
      );

    const second =
      createValues();

    second.lock.lock_id =
      "different-lock";

    assert.equal(
      verifyApprovalAttestationV2(
        attestation,
        second.lock
      ),
      false
    );
  }
);

test(
  "rejected attestation is valid but never active authorization",
  () => {
    const { lock } =
      createValues();

    const attestation =
      createApprovalAttestationV2(
        lock,
        principal,
        "REJECTED",
        {
          decidedAt:
            "2026-11-01T18:06:00Z"
        }
      );

    assert.equal(
      verifyApprovalAttestationV2(
        attestation,
        lock
      ),
      true
    );

    assert.equal(
      isApprovalAttestationActiveV2(
        attestation,
        lock,
        Date.parse(
          "2026-11-01T18:07:00Z"
        )
      ),
      false
    );
  }
);

test(
  "approved attestation is active before expiration",
  () => {
    const { lock } =
      createValues();

    const attestation =
      createApprovalAttestationV2(
        lock,
        principal,
        "APPROVED",
        {
          decidedAt:
            "2026-11-01T18:06:00Z",

          ttlMs:
            60000
        }
      );

    assert.equal(
      isApprovalAttestationActiveV2(
        attestation,
        lock,
        Date.parse(
          "2026-11-01T18:06:30Z"
        )
      ),
      true
    );
  }
);

test(
  "approved attestation becomes inactive at expiration",
  () => {
    const { lock } =
      createValues();

    const attestation =
      createApprovalAttestationV2(
        lock,
        principal,
        "APPROVED",
        {
          decidedAt:
            "2026-11-01T18:06:00Z",

          ttlMs:
            60000
        }
      );

    assert.equal(
      isApprovalAttestationActiveV2(
        attestation,
        lock,
        Date.parse(
          "2026-11-01T18:07:00Z"
        )
      ),
      false
    );
  }
);

test(
  "cannot create an approval for a tampered ActionLock",
  () => {
    const { lock } =
      createValues();

    lock.intent
      .request
      .proposed_action
      .parameters.amount =
      9999;

    assert.throws(
      () =>
        createApprovalAttestationV2(
          lock,
          principal,
          "APPROVED"
        ),
      /valid GenericActionLockV2/
    );
  }
);

test(
  "policy NONE rejects human approval attestations",
  () => {
    const { lock } =
      createValues(
        "NONE"
      );

    assert.throws(
      () =>
        createApprovalAttestationV2(
          lock,
          principal,
          "APPROVED"
        ),
      /does not permit/
    );
  }
);

test(
  "policy OPTIONAL permits an explicit human approval attestation",
  () => {
    const { lock } =
      createValues(
        "OPTIONAL"
      );

    assert.doesNotThrow(
      () =>
        createApprovalAttestationV2(
          lock,
          principal,
          "APPROVED",
          {
            decidedAt:
              "2026-11-01T18:06:00Z"
          }
        )
    );
  }
);

test(
  "cannot backdate approval before ActionLock creation",
  () => {
    const { lock } =
      createValues();

    assert.throws(
      () =>
        createApprovalAttestationV2(
          lock,
          principal,
          "APPROVED",
          {
            decidedAt:
              "2026-11-01T18:04:00Z"
          }
        ),
      /before the ActionLock/
    );
  }
);

test(
  "approval TTL must be positive",
  () => {
    const { lock } =
      createValues();

    assert.throws(
      () =>
        createApprovalAttestationV2(
          lock,
          principal,
          "APPROVED",
          {
            decidedAt:
              "2026-11-01T18:06:00Z",

            ttlMs:
              0
          }
        ),
      /TTL must be a positive integer/
    );
  }
);

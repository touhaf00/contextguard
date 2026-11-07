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
  createGenericActionLockV2,
  genericActionLockMatchesPipelineV2,
  verifyGenericActionLockV2
} from "../dist/core/action-lock.js";

function fixtures() {
  const request = {
    request_id:
      "req-lock-1",

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
        "REQUIRED",

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

          version: "state-v7",

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
      "Worker decision is independently supported.",

    verified_at:
      "2026-11-01T18:04:00Z"
  };

  return {
    request,
    evidence,
    worker,
    guard
  };
}

function createLock(
  values = fixtures()
) {
  return createGenericActionLockV2(
    values.request,
    values.evidence,
    values.worker,
    values.guard,
    {
      intentId:
        "intent-001",

      lockId:
        "lock-001",

      createdAt:
        "2026-11-01T18:05:00Z"
    }
  );
}

test(
  "creates an immutable generic ActionLock for READY plus PASS",
  () => {
    const lock =
      createLock();

    assert.equal(
      lock.lock_version,
      "2"
    );

    assert.equal(
      lock.intent
        .authorization_decision
        .status,
      "AWAITING_HUMAN_APPROVAL"
    );

    assert.equal(
      verifyGenericActionLockV2(
        lock
      ),
      true
    );
  }
);

test(
  "ActionLock embeds the exact proposed action",
  () => {
    const lock =
      createLock();

    assert.equal(
      lock.intent
        .request
        .proposed_action
        .action,
      "refund_payment"
    );

    assert.equal(
      lock.intent
        .request
        .proposed_action
        .parameters
        .amount,
      2500
    );
  }
);

test(
  "ActionLock embeds policy and runtime identity",
  () => {
    const lock =
      createLock();

    assert.equal(
      lock.intent
        .request
        .policy
        .version,
      "1.0.0"
    );

    assert.equal(
      lock.intent
        .request
        .runtime
        .guard_agent_id,
      "guard-1"
    );
  }
);

test(
  "ActionLock matches the exact upstream pipeline",
  () => {
    const values =
      fixtures();

    const lock =
      createLock(
        values
      );

    assert.equal(
      genericActionLockMatchesPipelineV2(
        lock,
        values.request,
        values.evidence,
        values.worker,
        values.guard
      ),
      true
    );
  }
);

test(
  "tampering with action parameters breaks lock integrity",
  () => {
    const lock =
      createLock();

    lock.intent
      .request
      .proposed_action
      .parameters
      .amount =
      5000;

    assert.equal(
      verifyGenericActionLockV2(
        lock
      ),
      false
    );
  }
);

test(
  "tampering with policy version breaks lock integrity",
  () => {
    const lock =
      createLock();

    lock.intent
      .request
      .policy
      .version =
      "2.0.0";

    assert.equal(
      verifyGenericActionLockV2(
        lock
      ),
      false
    );
  }
);

test(
  "tampering with runtime identity breaks lock integrity",
  () => {
    const lock =
      createLock();

    lock.intent
      .request
      .runtime
      .guard_agent_id =
      "guard-evil";

    assert.equal(
      verifyGenericActionLockV2(
        lock
      ),
      false
    );
  }
);

test(
  "tampering with the deterministic decision breaks lock integrity",
  () => {
    const lock =
      createLock();

    lock.intent
      .authorization_decision
      .reason =
      "Tampered.";

    assert.equal(
      verifyGenericActionLockV2(
        lock
      ),
      false
    );
  }
);

test(
  "changing upstream evidence makes the lock no longer match the pipeline",
  () => {
    const values =
      fixtures();

    const lock =
      createLock(
        values
      );

    values.evidence
      .evidence[0]
      .observation =
      "Different observation.";

    assert.equal(
      genericActionLockMatchesPipelineV2(
        lock,
        values.request,
        values.evidence,
        values.worker,
        values.guard
      ),
      false
    );
  }
);

test(
  "changing upstream Worker decision makes the lock no longer match",
  () => {
    const values =
      fixtures();

    const lock =
      createLock(
        values
      );

    values.worker.decision =
      "NOT_READY";

    assert.equal(
      genericActionLockMatchesPipelineV2(
        lock,
        values.request,
        values.evidence,
        values.worker,
        values.guard
      ),
      false
    );
  }
);

test(
  "changing Guard verification makes the lock no longer match",
  () => {
    const values =
      fixtures();

    const lock =
      createLock(
        values
      );

    values.guard.risk =
      "MEDIUM";

    assert.equal(
      genericActionLockMatchesPipelineV2(
        lock,
        values.request,
        values.evidence,
        values.worker,
        values.guard
      ),
      false
    );
  }
);

test(
  "UNKNOWN cannot create an ActionLock",
  () => {
    const values =
      fixtures();

    values.evidence
      .claims[0]
      .status =
      "UNKNOWN";

    values.evidence
      .claims[0]
      .evidence_refs =
      [];

    values.worker.evidence_digest =
      evidenceProtocolDigest(
        values.evidence,
        values.request
      );

    values.worker.decision =
      "UNKNOWN";

    values.worker.summary =
      "Evidence remains unavailable.";

    values.guard.evidence_digest =
      evidenceProtocolDigest(
        values.evidence,
        values.request
      );

    values.guard.worker_assessment_digest =
      workerAssessmentDigest(
        values.worker,
        values.evidence,
        values.request
      );

    values.guard.verified_claims =
      [];

    values.guard.unverified_claims =
      ["C1"];

    assert.throws(
      () =>
        createLock(
          values
        ),
      /requires an eligible authorization decision/
    );
  }
);

test(
  "REVIEW cannot create an ActionLock",
  () => {
    const values =
      fixtures();

    values.guard.verdict =
      "REVIEW";

    values.guard.risk =
      "MEDIUM";

    values.guard.worker_decision_supported =
      false;

    values.guard.verified_claims =
      [];

    values.guard.unverified_claims =
      ["C1"];

    values.guard.findings = [
      {
        finding_id: "F1",

        type:
          "MISSING_EVIDENCE",

        severity:
          "MEDIUM",

        claim_id: "C1",

        description:
          "Independent evidence is required."
      }
    ];

    assert.throws(
      () =>
        createLock(
          values
        ),
      /requires an eligible authorization decision/
    );
  }
);

test(
  "cannot backdate ActionLock before Guard verification",
  () => {
    const values =
      fixtures();

    assert.throws(
      () =>
        createGenericActionLockV2(
          values.request,
          values.evidence,
          values.worker,
          values.guard,
          {
            intentId:
              "intent-old",

            lockId:
              "lock-old",

            createdAt:
              "2026-11-01T18:03:30Z"
          }
        ),
      /before Guard verification/
    );
  }
);

test(
  "same semantic action can create distinct lock instances",
  () => {
    const values =
      fixtures();

    const first =
      createGenericActionLockV2(
        values.request,
        values.evidence,
        values.worker,
        values.guard,
        {
          intentId:
            "intent-a",

          lockId:
            "lock-a",

          createdAt:
            "2026-11-01T18:05:00Z"
        }
      );

    const second =
      createGenericActionLockV2(
        values.request,
        values.evidence,
        values.worker,
        values.guard,
        {
          intentId:
            "intent-b",

          lockId:
            "lock-b",

          createdAt:
            "2026-11-01T18:05:01Z"
        }
      );

    assert.notEqual(
      first.fingerprint,
      second.fingerprint
    );
  }
);

test(
  "tampering with the stored authorization decision digest breaks lock integrity",
  () => {
    const lock =
      createLock();

    lock.intent
      .authorization_decision_digest =
      "0".repeat(64);

    assert.equal(
      verifyGenericActionLockV2(
        lock
      ),
      false
    );
  }
);

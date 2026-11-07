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
  verifyGenericActionLockV2
} from "../dist/core/action-lock.js";

import {
  GenericAuthorizationApiErrorV2,
  evaluateGenericAuthorizationApiV2
} from "../dist/api/v2/authorization.js";

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
      "req-api-v2",

    subject,

    snapshot: {
      snapshot_id:
        "payment-v7",

      subject,

      version:
        "state-v7",

      observed_at:
        "2026-11-01T23:00:00Z"
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
        "worker-generic",

      guard_agent_id:
        "guard-generic",

      tool_scope: [
        "stripe.read"
      ]
    },

    requested_at:
      "2026-11-01T23:01:00Z"
  };

  const claimStatus =
    workerDecision ===
      "UNKNOWN"
      ? "UNKNOWN"
      : "SUPPORTED";

  const evidence = {
    protocol_version:
      "2",

    request_digest:
      authorizationRequestDigest(
        request
      ),

    assembled_at:
      "2026-11-01T23:02:00Z",

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
            "2026-11-01T23:01:30Z"
        },

        locator:
          "stripe.payment.pi_123",

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
        "UNKNOWN"
        ? 0.5
        : 0.92,

    summary:
      workerDecision ===
        "UNKNOWN"
        ? "Refundability remains unknown."
        : "Refundability is supported.",

    assessed_at:
      "2026-11-01T23:03:00Z"
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
        "REVIEW"
        ? [
            {
              finding_id:
                "F1",

              type:
                "MISSING_EVIDENCE",

              severity:
                "MEDIUM",

              claim_id:
                "C1",

              description:
                "More evidence is required.",

              required_check:
                "Read current payment state."
            }
          ]
        : [],

    requested_checks:
      guardVerdict ===
        "REVIEW"
        ? [
            {
              finding_id:
                "F1",

              check:
                "Read current payment state."
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
        ? "Worker decision is supported."
        : "Further verification is required.",

    verified_at:
      "2026-11-01T23:04:00Z"
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

const hostOptions = {
  intentId:
    "intent-api-v2",

  lockId:
    "lock-api-v2",

  lockCreatedAt:
    "2026-11-01T23:05:00Z"
};

test(
  "READY PASS with required approval creates an exact lock and requests human approval",
  () => {
    const result =
      evaluateGenericAuthorizationApiV2(
        buildPipeline(),
        hostOptions
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
      verifyGenericActionLockV2(
        result.lock
      ),
      true
    );

    assert.equal(
      result.execution_configured,
      false
    );

    assert.equal(
      result.external_action_executed,
      false
    );
  }
);

test(
  "READY PASS with policy NONE creates lock and moves only to preflight",
  () => {
    const result =
      evaluateGenericAuthorizationApiV2(
        buildPipeline({
          humanApproval:
            "NONE"
        }),
        hostOptions
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
      result.external_action_executed,
      false
    );
  }
);

test(
  "UNKNOWN PASS stops without creating an ActionLock",
  () => {
    const result =
      evaluateGenericAuthorizationApiV2(
        buildPipeline({
          workerDecision:
            "UNKNOWN"
        }),
        hostOptions
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
      result.lock,
      undefined
    );
  }
);

test(
  "Guard REVIEW stops without creating an ActionLock",
  () => {
    const pipeline =
      buildPipeline({
        workerDecision:
          "UNKNOWN",

        guardVerdict:
          "REVIEW"
      });

    const result =
      evaluateGenericAuthorizationApiV2(
        pipeline,
        hostOptions
      );

    assert.equal(
      result.status,
      "STOPPED_REVIEW"
    );

    assert.equal(
      result.next_step,
      "STOP"
    );

    assert.equal(
      result.lock,
      undefined
    );
  }
);

test(
  "mismatched evidence binding is rejected fail-closed",
  () => {
    const pipeline =
      buildPipeline();

    pipeline.evidence
      .request_digest =
      "0".repeat(64);

    assert.throws(
      () =>
        evaluateGenericAuthorizationApiV2(
          pipeline,
          hostOptions
        ),
      /bound to a different AuthorizationRequest/
    );
  }
);

test(
  "unknown top-level API fields are rejected",
  () => {
    const pipeline =
      buildPipeline();

    assert.throws(
      () =>
        evaluateGenericAuthorizationApiV2(
          {
            ...pipeline,

            execute:
              true
          },
          hostOptions
        ),
      (error) =>
        error instanceof
          GenericAuthorizationApiErrorV2 &&
        error.code ===
          "UNSUPPORTED_FIELD"
    );
  }
);

test(
  "missing required API fields are rejected",
  () => {
    const pipeline =
      buildPipeline();

    delete pipeline
      .guard_verification;

    assert.throws(
      () =>
        evaluateGenericAuthorizationApiV2(
          pipeline,
          hostOptions
        ),
      (error) =>
        error instanceof
          GenericAuthorizationApiErrorV2 &&
        error.code ===
          "INVALID_BODY"
    );
  }
);

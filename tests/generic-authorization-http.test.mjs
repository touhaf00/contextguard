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
  handleGenericAuthorizationHttpV2
} from "../dist/api/v2/http.js";

function pipeline() {
  const subject = {
    provider:
      "stripe",

    resource_type:
      "payment",

    resource_id:
      "pi_http_123"
  };

  const request = {
    request_id:
      "req-http-v2",

    subject,

    snapshot: {
      snapshot_id:
        "payment-state",

      subject,

      version:
        "state-v1",

      observed_at:
        "2026-11-01T23:10:00Z"
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
        "REQUIRED",

      preflight_required:
        true
    },

    runtime: {
      platform:
        "cominty",

      worker_agent_id:
        "worker-http",

      guard_agent_id:
        "guard-http",

      tool_scope: [
        "stripe.read"
      ]
    },

    requested_at:
      "2026-11-01T23:11:00Z"
  };

  const evidence = {
    protocol_version:
      "2",

    request_digest:
      authorizationRequestDigest(
        request
      ),

    assembled_at:
      "2026-11-01T23:12:00Z",

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
            "2026-11-01T23:11:30Z"
        },

        locator:
          "stripe.payment",

        observation:
          "Payment is refundable.",

        level:
          "OUTPUT_OBSERVED"
      }
    ],

    claims: [
      {
        claim_id:
          "C1",

        statement:
          "Payment is refundable.",

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
      "Payment is refundable.",

    assessed_at:
      "2026-11-01T23:13:00Z"
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
      "2026-11-01T23:14:00Z"
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

const options = {
  intentId:
    "intent-http",

  lockId:
    "lock-http",

  lockCreatedAt:
    "2026-11-01T23:15:00Z"
};

test(
  "HTTP adapter returns 200 for a valid generic authorization pipeline",
  () => {
    const result =
      handleGenericAuthorizationHttpV2(
        pipeline(),
        options
      );

    assert.equal(
      result.status,
      200
    );

    assert.equal(
      result.body.status,
      "AWAITING_HUMAN_APPROVAL"
    );

    assert.equal(
      result.body.next_step,
      "COLLECT_HUMAN_APPROVAL"
    );

    assert.equal(
      result.body.external_action_executed,
      false
    );
  }
);

test(
  "HTTP adapter returns 400 for unsupported top-level fields",
  () => {
    const body =
      pipeline();

    body.execute =
      true;

    const result =
      handleGenericAuthorizationHttpV2(
        body,
        options
      );

    assert.equal(
      result.status,
      400
    );

    assert.equal(
      result.body.error.code,
      "UNSUPPORTED_FIELD"
    );

    assert.equal(
      result.body.external_action_executed,
      false
    );
  }
);

test(
  "HTTP adapter returns 400 for broken cryptographic pipeline binding",
  () => {
    const body =
      pipeline();

    body.evidence
      .request_digest =
      "0".repeat(64);

    const result =
      handleGenericAuthorizationHttpV2(
        body,
        options
      );

    assert.equal(
      result.status,
      400
    );

    assert.equal(
      result.body.error.code,
      "INVALID_AUTHORIZATION_PIPELINE"
    );

    assert.match(
      result.body.error.message,
      /different AuthorizationRequest/
    );
  }
);

test(
  "HTTP errors never claim execution was configured or performed",
  () => {
    const result =
      handleGenericAuthorizationHttpV2(
        null,
        options
      );

    assert.equal(
      result.status,
      400
    );

    assert.equal(
      result.body.execution_configured,
      false
    );

    assert.equal(
      result.body.external_action_executed,
      false
    );
  }
);

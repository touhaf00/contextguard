import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizationRequestDigest
} from "../dist/core/authorization-integrity.js";

import {
  evidenceProtocolDigest
} from "../dist/core/evidence.js";

import {
  validateWorkerAssessmentV2,
  workerAssessmentDigest
} from "../dist/core/assessment.js";

import {
  WORKER_INVARIANT_PUBLIC_MESSAGE,
  workerInvariantHttpError
} from "../dist/api/ui/guard-invariant-error.js";

function requestFixture() {
  return {
    request_id: "req-1",

    subject: {
      provider: "stripe",
      resource_type: "payment",
      resource_id: "pi_123"
    },

    snapshot: {
      snapshot_id: "payment-v7",

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
      policy_id: "refund-safety",
      version: "1.0.0",
      name: "Refund safety",

      objective:
        "Verify refund conditions.",

      decision_rules: [
        "Payment exists.",
        "Amount remains refundable."
      ],

      human_approval: "REQUIRED",
      preflight_required: true
    },

    runtime: {
      platform: "cominty",
      worker_agent_id: "worker-1",
      guard_agent_id: "guard-1",

      tool_scope: [
        "stripe.read"
      ]
    },

    requested_at:
      "2026-11-01T18:01:00Z"
  };
}

function evidenceFixture(
  request = requestFixture()
) {
  return {
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
          snapshot_id: "payment-v7",

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
          "Payment exists and succeeded.",

        level:
          "OUTPUT_OBSERVED"
      }
    ],

    claims: [
      {
        claim_id: "C1",

        statement:
          "The payment exists.",

        criticality:
          "REQUIRED",

        status:
          "SUPPORTED",

        evidence_refs:
          ["E1"]
      }
    ]
  };
}

function assessmentFixture(
  request = requestFixture(),
  evidence =
    evidenceFixture(request)
) {
  return {
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

    confidence: 0.91,

    summary:
      "Required refund conditions are supported.",

    assessed_at:
      "2026-11-01T18:03:00Z"
  };
}

test(
  "accepts a valid generic Worker assessment",
  () => {
    const request =
      requestFixture();

    const evidence =
      evidenceFixture(request);

    const assessment =
      validateWorkerAssessmentV2(
        assessmentFixture(
          request,
          evidence
        ),
        evidence,
        request
      );

    assert.equal(
      assessment.decision,
      "READY"
    );
  }
);

test(
  "produces a stable Worker assessment digest",
  () => {
    const request =
      requestFixture();

    const evidence =
      evidenceFixture(request);

    const assessment =
      assessmentFixture(
        request,
        evidence
      );

    assert.equal(
      workerAssessmentDigest(
        assessment,
        evidence,
        request
      ),

      workerAssessmentDigest(
        assessment,
        evidence,
        request
      )
    );
  }
);

test(
  "changing Worker decision changes the assessment digest",
  () => {
    const request =
      requestFixture();

    const evidence =
      evidenceFixture(request);

    const first =
      assessmentFixture(
        request,
        evidence
      );

    const second =
      assessmentFixture(
        request,
        evidence
      );

    second.decision =
      "UNKNOWN";

    assert.notEqual(
      workerAssessmentDigest(
        first,
        evidence,
        request
      ),

      workerAssessmentDigest(
        second,
        evidence,
        request
      )
    );
  }
);

test(
  "rejects assessment bound to another request",
  () => {
    const request =
      requestFixture();

    const evidence =
      evidenceFixture(request);

    const assessment =
      assessmentFixture(
        request,
        evidence
      );

    assessment.request_digest =
      "0".repeat(64);

    assert.throws(
      () =>
        validateWorkerAssessmentV2(
          assessment,
          evidence,
          request
        ),
      /different AuthorizationRequest/
    );
  }
);

test(
  "rejects assessment bound to another evidence bundle",
  () => {
    const request =
      requestFixture();

    const evidence =
      evidenceFixture(request);

    const assessment =
      assessmentFixture(
        request,
        evidence
      );

    assessment.evidence_digest =
      "0".repeat(64);

    assert.throws(
      () =>
        validateWorkerAssessmentV2(
          assessment,
          evidence,
          request
        ),
      /different EvidenceProtocolV2/
    );
  }
);

test(
  "READY requires every REQUIRED claim to remain supported",
  () => {
    const request =
      requestFixture();

    const evidence =
      evidenceFixture(request);

    evidence.claims[0].status =
      "UNKNOWN";

    evidence.claims[0]
      .evidence_refs =
      [];

    const assessment = {
      ...assessmentFixture(
        request,
        evidence
      ),

      decision: "READY"
    };

    assert.throws(
      () =>
        validateWorkerAssessmentV2(
          assessment,
          evidence,
          request
        ),
      /READY requires every REQUIRED claim/
    );

    let thrown;
    try {
      validateWorkerAssessmentV2(assessment, evidence, request);
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown instanceof Error);
    assert.ok(
      thrown.message.includes(`Required claims not SUPPORTED: ${evidence.claims[0].claim_id}=UNKNOWN`),
      thrown.message
    );

    assert.deepEqual(workerInvariantHttpError(thrown), {
      status: 502,
      message: WORKER_INVARIANT_PUBLIC_MESSAGE
    });
    assert.ok(!WORKER_INVARIANT_PUBLIC_MESSAGE.includes(evidence.claims[0].claim_id));
  }
);

test(
  "UNKNOWN accepts an unresolved REQUIRED claim",
  () => {
    const request =
      requestFixture();

    const evidence =
      evidenceFixture(request);

    evidence.claims[0].status =
      "UNKNOWN";

    evidence.claims[0]
      .evidence_refs =
      [];

    const assessment = {
      ...assessmentFixture(
        request,
        evidence
      ),

      decision: "UNKNOWN",

      summary:
        "Required evidence remains unavailable."
    };

    assert.doesNotThrow(
      () =>
        validateWorkerAssessmentV2(
          assessment,
          evidence,
          request
        )
    );
  }
);

test(
  "rejects assessment timestamp before evidence assembly",
  () => {
    const request =
      requestFixture();

    const evidence =
      evidenceFixture(request);

    const assessment =
      assessmentFixture(
        request,
        evidence
      );

    assessment.assessed_at =
      "2026-11-01T18:01:00Z";

    assert.throws(
      () =>
        validateWorkerAssessmentV2(
          assessment,
          evidence,
          request
        ),
      /before its evidence bundle/
    );
  }
);

test(
  "rejects invalid Worker confidence",
  () => {
    const request =
      requestFixture();

    const evidence =
      evidenceFixture(request);

    const assessment =
      assessmentFixture(
        request,
        evidence
      );

    assessment.confidence =
      1.5;

    assert.throws(
      () =>
        validateWorkerAssessmentV2(
          assessment,
          evidence,
          request
        ),
      /between 0 and 1/
    );
  }
);

test(
  "evidence tampering invalidates the Worker binding",
  () => {
    const request =
      requestFixture();

    const evidence =
      evidenceFixture(request);

    const assessment =
      assessmentFixture(
        request,
        evidence
      );

    evidence.evidence[0]
      .observation =
      "Tampered observation.";

    assert.throws(
      () =>
        validateWorkerAssessmentV2(
          assessment,
          evidence,
          request
        ),
      /different EvidenceProtocolV2/
    );
  }
);

test(
  "changing the proposed action invalidates the whole Worker chain",
  () => {
    const request =
      requestFixture();

    const evidence =
      evidenceFixture(request);

    const assessment =
      assessmentFixture(
        request,
        evidence
      );

    const changedRequest =
      requestFixture();

    changedRequest
      .proposed_action
      .parameters.amount =
      5000;

    assert.throws(
      () =>
        validateWorkerAssessmentV2(
          assessment,
          evidence,
          changedRequest
        ),
      /different AuthorizationRequest/
    );
  }
);

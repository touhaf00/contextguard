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
  guardVerificationDigest,
  validateGuardVerificationV2
} from "../dist/core/verification.js";

function requestFixture() {
  return {
    request_id: "req-guard-1",

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
        "Payment must exist."
      ],

      human_approval: "REQUIRED",
      preflight_required: true
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
          "Payment exists.",

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

    confidence: 0.9,

    summary:
      "Required evidence supports the decision.",

    assessed_at:
      "2026-11-01T18:03:00Z"
  };
}

function guardFixture(
  request = requestFixture(),
  evidence =
    evidenceFixture(request),
  assessment =
    assessmentFixture(
      request,
      evidence
    )
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

    worker_assessment_digest:
      workerAssessmentDigest(
        assessment,
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
}

test(
  "accepts a complete generic PASS verification",
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

    const result =
      validateGuardVerificationV2(
        guardFixture(
          request,
          evidence,
          assessment
        ),
        assessment,
        evidence,
        request
      );

    assert.equal(
      result.verdict,
      "PASS"
    );
  }
);

test(
  "produces a stable Guard verification digest",
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

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    assert.equal(
      guardVerificationDigest(
        guard,
        assessment,
        evidence,
        request
      ),

      guardVerificationDigest(
        guard,
        assessment,
        evidence,
        request
      )
    );
  }
);

test(
  "rejects Guard verification bound to another request",
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

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    guard.request_digest =
      "0".repeat(64);

    assert.throws(
      () =>
        validateGuardVerificationV2(
          guard,
          assessment,
          evidence,
          request
        ),
      /different AuthorizationRequest/
    );
  }
);

test(
  "rejects Guard verification bound to another evidence bundle",
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

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    guard.evidence_digest =
      "0".repeat(64);

    assert.throws(
      () =>
        validateGuardVerificationV2(
          guard,
          assessment,
          evidence,
          request
        ),
      /different EvidenceProtocolV2/
    );
  }
);

test(
  "rejects Guard verification bound to another Worker assessment",
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

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    guard.worker_assessment_digest =
      "0".repeat(64);

    assert.throws(
      () =>
        validateGuardVerificationV2(
          guard,
          assessment,
          evidence,
          request
        ),
      /different WorkerAssessmentV2/
    );
  }
);

test(
  "rejects unknown Worker claim classification",
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

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    guard.verified_claims =
      ["C999"];

    assert.throws(
      () =>
        validateGuardVerificationV2(
          guard,
          assessment,
          evidence,
          request
        ),
      /unknown Worker claim_id/
    );
  }
);

test(
  "rejects a claim appearing in multiple Guard classifications",
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

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    guard.unverified_claims =
      ["C1"];

    assert.throws(
      () =>
        validateGuardVerificationV2(
          guard,
          assessment,
          evidence,
          request
        ),
      /more than one Guard classification/
    );
  }
);

test(
  "rejects an unclassified Worker claim",
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

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    guard.verified_claims =
      [];

    assert.throws(
      () =>
        validateGuardVerificationV2(
          guard,
          assessment,
          evidence,
          request
        ),
      /did not classify Worker claim_id/
    );
  }
);

test(
  "finding cannot reference unknown Worker evidence",
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

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    guard.verdict =
      "REVIEW";

    guard.worker_decision_supported =
      false;

    guard.verified_claims =
      [];

    guard.unverified_claims =
      ["C1"];

    guard.findings = [
      {
        finding_id: "F1",

        type:
          "MISSING_EVIDENCE",

        severity:
          "MEDIUM",

        claim_id: "C1",

        description:
          "More evidence is required.",

        verified_evidence:
          ["E999"]
      }
    ];

    assert.throws(
      () =>
        validateGuardVerificationV2(
          guard,
          assessment,
          evidence,
          request
        ),
      /unknown Worker evidence_id/
    );
  }
);

test(
  "PASS cannot contain contradicted claims",
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

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    guard.verified_claims =
      [];

    guard.contradicted_claims =
      ["C1"];

    assert.throws(
      () =>
        validateGuardVerificationV2(
          guard,
          assessment,
          evidence,
          request
        ),
      /PASS cannot contain contradicted/
    );
  }
);

test(
  "PASS requires Worker decision support",
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

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    guard.worker_decision_supported =
      false;

    assert.throws(
      () =>
        validateGuardVerificationV2(
          guard,
          assessment,
          evidence,
          request
        ),
      /PASS requires worker_decision_supported=true/
    );
  }
);

test(
  "READY plus PASS requires every REQUIRED claim to be verified",
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

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    guard.verified_claims =
      [];

    guard.unverified_claims =
      ["C1"];

    assert.throws(
      () =>
        validateGuardVerificationV2(
          guard,
          assessment,
          evidence,
          request
        ),
      /READY \+ PASS requires REQUIRED Worker claim/
    );
  }
);

test(
  "UNKNOWN plus PASS may preserve an independently confirmed evidence gap",
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

    const assessment =
      assessmentFixture(
        request,
        evidence
      );

    assessment.decision =
      "UNKNOWN";

    assessment.summary =
      "Required evidence is unavailable.";

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    guard.verified_claims =
      [];

    guard.unverified_claims =
      ["C1"];

    guard.risk =
      "MEDIUM";

    guard.summary =
      "The unresolved evidence gap supports UNKNOWN.";

    assert.doesNotThrow(
      () =>
        validateGuardVerificationV2(
          guard,
          assessment,
          evidence,
          request
        )
    );
  }
);

test(
  "REVIEW requires at least one finding",
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

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    guard.verdict =
      "REVIEW";

    guard.worker_decision_supported =
      false;

    assert.throws(
      () =>
        validateGuardVerificationV2(
          guard,
          assessment,
          evidence,
          request
        ),
      /REVIEW requires at least one finding/
    );
  }
);

test(
  "accepts targeted REVIEW with a matching requested check",
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

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    guard.verdict =
      "REVIEW";

    guard.risk =
      "MEDIUM";

    guard.worker_decision_supported =
      false;

    guard.retry_recommended =
      true;

    guard.verified_claims =
      [];

    guard.unverified_claims =
      ["C1"];

    guard.findings = [
      {
        finding_id: "F1",

        type:
          "MISSING_EVIDENCE",

        severity:
          "MEDIUM",

        claim_id: "C1",

        description:
          "Payment state needs independent confirmation.",

        required_check:
          "Re-read the current payment state."
      }
    ];

    guard.requested_checks = [
      {
        finding_id: "F1",

        check:
          "Re-read the current payment state."
      }
    ];

    assert.doesNotThrow(
      () =>
        validateGuardVerificationV2(
          guard,
          assessment,
          evidence,
          request
        )
    );
  }
);

test(
  "requested check must match its finding exactly",
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

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    guard.verdict =
      "REVIEW";

    guard.worker_decision_supported =
      false;

    guard.retry_recommended =
      true;

    guard.verified_claims =
      [];

    guard.unverified_claims =
      ["C1"];

    guard.findings = [
      {
        finding_id: "F1",

        type:
          "MISSING_EVIDENCE",

        severity:
          "MEDIUM",

        claim_id: "C1",

        description:
          "Evidence gap.",

        required_check:
          "Check A"
      }
    ];

    guard.requested_checks = [
      {
        finding_id: "F1",
        check: "Different check"
      }
    ];

    assert.throws(
      () =>
        validateGuardVerificationV2(
          guard,
          assessment,
          evidence,
          request
        ),
      /must exactly match/
    );
  }
);

test(
  "accepts terminal REVIEW without retry checks",
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

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    guard.verdict =
      "REVIEW";

    guard.risk =
      "MEDIUM";

    guard.worker_decision_supported =
      false;

    guard.retry_recommended =
      false;

    guard.verified_claims =
      [];

    guard.unverified_claims =
      ["C1"];

    guard.findings = [
      {
        finding_id: "F1",

        type:
          "MISSING_EVIDENCE",

        severity:
          "MEDIUM",

        claim_id: "C1",

        description:
          "Required evidence cannot currently be retrieved."
      }
    ];

    guard.requested_checks =
      [];

    assert.doesNotThrow(
      () =>
        validateGuardVerificationV2(
          guard,
          assessment,
          evidence,
          request
        )
    );
  }
);

test(
  "FAIL requires a material HIGH or CRITICAL finding",
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

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    guard.verdict =
      "FAIL";

    guard.risk =
      "LOW";

    guard.worker_decision_supported =
      false;

    guard.verified_claims =
      [];

    guard.contradicted_claims =
      ["C1"];

    guard.findings = [
      {
        finding_id: "F1",

        type:
          "CONTRADICTION",

        severity:
          "LOW",

        claim_id: "C1",

        description:
          "Minor contradiction."
      }
    ];

    assert.throws(
      () =>
        validateGuardVerificationV2(
          guard,
          assessment,
          evidence,
          request
        ),
      /HIGH or CRITICAL/
    );
  }
);

test(
  "accepts FAIL for a material evidence integrity failure",
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

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    guard.verdict =
      "FAIL";

    guard.risk =
      "CRITICAL";

    guard.worker_decision_supported =
      false;

    guard.verified_claims =
      [];

    guard.contradicted_claims =
      ["C1"];

    guard.findings = [
      {
        finding_id: "F1",

        type:
          "FABRICATED_EVIDENCE",

        severity:
          "CRITICAL",

        claim_id: "C1",

        description:
          "The cited evidence could not exist as represented."
      }
    ];

    assert.doesNotThrow(
      () =>
        validateGuardVerificationV2(
          guard,
          assessment,
          evidence,
          request
        )
    );
  }
);

test(
  "rejects Guard verification timestamp before Worker assessment",
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

    const guard =
      guardFixture(
        request,
        evidence,
        assessment
      );

    guard.verified_at =
      "2026-11-01T18:02:30Z";

    assert.throws(
      () =>
        validateGuardVerificationV2(
          guard,
          assessment,
          evidence,
          request
        ),
      /before the Worker assessment/
    );
  }
);

test(
  "changing Guard classification changes verification digest",
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

    const first =
      guardFixture(
        request,
        evidence,
        assessment
      );

    const second =
      guardFixture(
        request,
        evidence,
        assessment
      );

    second.risk =
      "MEDIUM";

    assert.notEqual(
      guardVerificationDigest(
        first,
        assessment,
        evidence,
        request
      ),

      guardVerificationDigest(
        second,
        assessment,
        evidence,
        request
      )
    );
  }
);

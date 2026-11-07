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
  guardVerificationDigest
} from "../dist/core/verification.js";

import {
  authorizationDecisionDigest,
  evaluateAuthorizationDecisionV2
} from "../dist/core/decision.js";

function fixtures() {
  const request = {
    request_id: "req-gate-1",

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

  return {
    request,
    evidence,
    worker,
    guard
  };
}

test(
  "READY plus PASS plus required approval waits for human approval",
  () => {
    const {
      request,
      evidence,
      worker,
      guard
    } = fixtures();

    const result =
      evaluateAuthorizationDecisionV2(
        request,
        evidence,
        worker,
        guard
      );

    assert.equal(
      result.status,
      "AWAITING_HUMAN_APPROVAL"
    );

    assert.equal(
      result.action_lock_eligible,
      true
    );

    assert.equal(
      result.policy_authorized,
      false
    );

    assert.equal(
      result.external_action_executed,
      false
    );
  }
);

test(
  "READY plus PASS with no mandatory approval becomes policy authorized",
  () => {
    const values =
      fixtures();

    values.request
      .policy
      .human_approval =
      "NONE";

    values.evidence.request_digest =
      authorizationRequestDigest(
        values.request
      );

    values.worker.request_digest =
      authorizationRequestDigest(
        values.request
      );

    values.worker.evidence_digest =
      evidenceProtocolDigest(
        values.evidence,
        values.request
      );

    values.guard.request_digest =
      authorizationRequestDigest(
        values.request
      );

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

    const result =
      evaluateAuthorizationDecisionV2(
        values.request,
        values.evidence,
        values.worker,
        values.guard
      );

    assert.equal(
      result.status,
      "AUTHORIZED_BY_POLICY"
    );

    assert.equal(
      result.policy_authorized,
      true
    );
  }
);

test(
  "OPTIONAL human approval does not create a mandatory gate",
  () => {
    const values =
      fixtures();

    values.request
      .policy
      .human_approval =
      "OPTIONAL";

    values.evidence.request_digest =
      authorizationRequestDigest(
        values.request
      );

    values.worker.request_digest =
      authorizationRequestDigest(
        values.request
      );

    values.worker.evidence_digest =
      evidenceProtocolDigest(
        values.evidence,
        values.request
      );

    values.guard.request_digest =
      authorizationRequestDigest(
        values.request
      );

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

    const result =
      evaluateAuthorizationDecisionV2(
        values.request,
        values.evidence,
        values.worker,
        values.guard
      );

    assert.equal(
      result.status,
      "AUTHORIZED_BY_POLICY"
    );
  }
);

test(
  "NOT_READY plus PASS is blocked",
  () => {
    const values =
      fixtures();

    values.worker.decision =
      "NOT_READY";

    values.worker.summary =
      "The requested action is not ready.";

    values.guard.worker_assessment_digest =
      workerAssessmentDigest(
        values.worker,
        values.evidence,
        values.request
      );

    const result =
      evaluateAuthorizationDecisionV2(
        values.request,
        values.evidence,
        values.worker,
        values.guard
      );

    assert.equal(
      result.status,
      "BLOCKED_NOT_READY"
    );

    assert.equal(
      result.action_lock_eligible,
      false
    );
  }
);

test(
  "UNKNOWN plus PASS stops safely",
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
      "Required evidence remains unavailable.";

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

    values.guard.risk =
      "MEDIUM";

    values.guard.summary =
      "UNKNOWN is independently supported.";

    const result =
      evaluateAuthorizationDecisionV2(
        values.request,
        values.evidence,
        values.worker,
        values.guard
      );

    assert.equal(
      result.status,
      "STOPPED_UNKNOWN"
    );
  }
);

test(
  "REVIEW always stops authorization",
  () => {
    const values =
      fixtures();

    values.guard.verdict =
      "REVIEW";

    values.guard.risk =
      "MEDIUM";

    values.guard.worker_decision_supported =
      false;

    values.guard.retry_recommended =
      true;

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
          "Independent confirmation is required.",

        required_check:
          "Re-read the payment state."
      }
    ];

    values.guard.requested_checks = [
      {
        finding_id: "F1",

        check:
          "Re-read the payment state."
      }
    ];

    const result =
      evaluateAuthorizationDecisionV2(
        values.request,
        values.evidence,
        values.worker,
        values.guard
      );

    assert.equal(
      result.status,
      "STOPPED_REVIEW"
    );

    assert.equal(
      result.policy_authorized,
      false
    );
  }
);

test(
  "FAIL always blocks authorization",
  () => {
    const values =
      fixtures();

    values.guard.verdict =
      "FAIL";

    values.guard.risk =
      "CRITICAL";

    values.guard.worker_decision_supported =
      false;

    values.guard.verified_claims =
      [];

    values.guard.contradicted_claims =
      ["C1"];

    values.guard.findings = [
      {
        finding_id: "F1",

        type:
          "FABRICATED_EVIDENCE",

        severity:
          "CRITICAL",

        claim_id: "C1",

        description:
          "Evidence integrity failed."
      }
    ];

    const result =
      evaluateAuthorizationDecisionV2(
        values.request,
        values.evidence,
        values.worker,
        values.guard
      );

    assert.equal(
      result.status,
      "BLOCKED_VERIFICATION"
    );
  }
);

test(
  "preflight requirement is preserved by the deterministic decision",
  () => {
    const {
      request,
      evidence,
      worker,
      guard
    } = fixtures();

    const result =
      evaluateAuthorizationDecisionV2(
        request,
        evidence,
        worker,
        guard
      );

    assert.equal(
      result.preflight_required,
      true
    );
  }
);

test(
  "decision contains all upstream cryptographic bindings",
  () => {
    const {
      request,
      evidence,
      worker,
      guard
    } = fixtures();

    const result =
      evaluateAuthorizationDecisionV2(
        request,
        evidence,
        worker,
        guard
      );

    assert.equal(
      result.request_digest,
      authorizationRequestDigest(
        request
      )
    );

    assert.equal(
      result.evidence_digest,
      evidenceProtocolDigest(
        evidence,
        request
      )
    );

    assert.equal(
      result.worker_assessment_digest,
      workerAssessmentDigest(
        worker,
        evidence,
        request
      )
    );

    assert.equal(
      result.guard_verification_digest,
      guardVerificationDigest(
        guard,
        worker,
        evidence,
        request
      )
    );
  }
);

test(
  "deterministic authorization decision digest is stable",
  () => {
    const {
      request,
      evidence,
      worker,
      guard
    } = fixtures();

    assert.equal(
      authorizationDecisionDigest(
        request,
        evidence,
        worker,
        guard
      ),

      authorizationDecisionDigest(
        request,
        evidence,
        worker,
        guard
      )
    );
  }
);

test(
  "changing action amount changes the whole decision identity",
  () => {
    const first =
      fixtures();

    const second =
      fixtures();

    const firstDigest =
      authorizationDecisionDigest(
        first.request,
        first.evidence,
        first.worker,
        first.guard
      );

    second.request
      .proposed_action
      .parameters.amount =
      5000;

    second.evidence.request_digest =
      authorizationRequestDigest(
        second.request
      );

    second.worker.request_digest =
      authorizationRequestDigest(
        second.request
      );

    second.worker.evidence_digest =
      evidenceProtocolDigest(
        second.evidence,
        second.request
      );

    second.guard.request_digest =
      authorizationRequestDigest(
        second.request
      );

    second.guard.evidence_digest =
      evidenceProtocolDigest(
        second.evidence,
        second.request
      );

    second.guard.worker_assessment_digest =
      workerAssessmentDigest(
        second.worker,
        second.evidence,
        second.request
      );

    const secondDigest =
      authorizationDecisionDigest(
        second.request,
        second.evidence,
        second.worker,
        second.guard
      );

    assert.notEqual(
      firstDigest,
      secondDigest
    );
  }
);

test(
  "invalid upstream Guard binding cannot reach deterministic authorization",
  () => {
    const values =
      fixtures();

    values.guard
      .worker_assessment_digest =
      "0".repeat(64);

    assert.throws(
      () =>
        evaluateAuthorizationDecisionV2(
          values.request,
          values.evidence,
          values.worker,
          values.guard
        ),
      /different WorkerAssessmentV2/
    );
  }
);

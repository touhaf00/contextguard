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

import { guardInvariantHttpError, GUARD_INVARIANT_PUBLIC_MESSAGE } from "../dist/api/ui/guard-invariant-error.js";

const finding = (id, severity) => ({
  finding_id: id, type: "MISSING_EVIDENCE", severity, claim_id: "C1",
  description: `Finding ${id} (${severity}).`
});

function reviewGuard(severities, overrides = {}) {
  const request = requestFixture();
  const evidence = evidenceFixture(request);
  const assessment = assessmentFixture(request, evidence);
  const guard = guardFixture(request, evidence, assessment);
  guard.verdict = "REVIEW";
  guard.risk = "MEDIUM";
  guard.worker_decision_supported = false;
  guard.retry_recommended = false;
  guard.verified_claims = [];
  guard.unverified_claims = ["C1"];
  guard.requested_checks = [];
  guard.findings = severities.map((severity, index) => finding(`F${index + 1}`, severity));
  Object.assign(guard, overrides);
  return () => validateGuardVerificationV2(guard, assessment, evidence, request);
}

test("Code fix: REVIEW based only on LOW findings is still rejected", () => {
  assert.throws(reviewGuard(["LOW"]), /REVIEW cannot be based on LOW-only findings/);
  assert.throws(reviewGuard(["LOW", "LOW", "LOW"]), /REVIEW cannot be based on LOW-only findings/);
});

test("Code fix: REVIEW with at least one MEDIUM or higher finding is accepted even when LOW findings accompany it", () => {
  for (const severities of [["MEDIUM"], ["MEDIUM", "LOW"], ["LOW", "MEDIUM"], ["HIGH", "LOW", "LOW"], ["LOW", "CRITICAL"], ["MEDIUM", "HIGH"]]) {
    assert.doesNotThrow(reviewGuard(severities), severities.join(","));
  }
});

test("Code fix: an accepted REVIEW keeps every finding, LOW ones included, and is never a PASS", () => {
  const request = requestFixture();
  const evidence = evidenceFixture(request);
  const assessment = assessmentFixture(request, evidence);
  const guard = guardFixture(request, evidence, assessment);
  Object.assign(guard, {
    verdict: "REVIEW", risk: "MEDIUM", worker_decision_supported: false, retry_recommended: false,
    verified_claims: [], unverified_claims: ["C1"], requested_checks: [],
    findings: [finding("F1", "MEDIUM"), finding("F2", "LOW")]
  });
  const result = validateGuardVerificationV2(guard, assessment, evidence, request);
  assert.equal(result.verdict, "REVIEW");
  assert.equal(result.worker_decision_supported, false);
  assert.deepEqual(result.findings.map(f => f.severity), ["MEDIUM", "LOW"]);
});

test("Code fix: the other REVIEW invariants are unchanged", () => {
  assert.throws(reviewGuard([]), /REVIEW requires at least one finding/);
  assert.throws(reviewGuard(["MEDIUM", "LOW"], { worker_decision_supported: true }), /REVIEW cannot claim the Worker decision is supported/);
  assert.throws(reviewGuard(["MEDIUM", "LOW"], { retry_recommended: true }), /retry requires at least one requested check/);
});

test("Code fix: PASS still cannot contain any finding, LOW included", () => {
  const request = requestFixture();
  const evidence = evidenceFixture(request);
  const assessment = assessmentFixture(request, evidence);
  const guard = guardFixture(request, evidence, assessment);
  guard.findings = [finding("F1", "LOW")];
  assert.throws(() => validateGuardVerificationV2(guard, assessment, evidence, request), /PASS cannot contain findings/);
});

test("Code fix: FAIL still requires a HIGH or CRITICAL finding", () => {
  const request = requestFixture();
  const evidence = evidenceFixture(request);
  const assessment = assessmentFixture(request, evidence);
  const failGuard = findings => {
    const guard = guardFixture(request, evidence, assessment);
    Object.assign(guard, { verdict: "FAIL", risk: "HIGH", worker_decision_supported: false, verified_claims: [],
      contradicted_claims: ["C1"], findings: findings.map((s, i) => ({ ...finding(`F${i + 1}`, s), type: "CONTRADICTION" })) });
    return () => validateGuardVerificationV2(guard, assessment, evidence, request);
  };
  assert.throws(failGuard(["LOW"]), /HIGH or CRITICAL/);
  assert.throws(failGuard(["MEDIUM", "LOW"]), /HIGH or CRITICAL/);
  assert.doesNotThrow(failGuard(["HIGH", "LOW"]));
});

test("Code fix: a real validator rejection (LOW-only REVIEW) reaches the UI as a readable 502, never as a generic 500", () => {
  let thrown = null;
  try { reviewGuard(["LOW", "LOW"])(); } catch (error) { thrown = error; }
  assert.ok(thrown, "the validator must still reject a LOW-only REVIEW");
  const mapped = guardInvariantHttpError(thrown);
  assert.deepEqual(mapped, { status: 502, message: GUARD_INVARIANT_PUBLIC_MESSAGE });
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  materializeGenericWorkerOutputV2
} from "../dist/agents/generic-worker.js";

import {
  materializeGenericGuardOutputV2
} from "../dist/agents/generic-guard.js";

import {
  buildGenericWorkerRetryPrompt,
  materializeGenericWorkerRetryOutputV2
} from "../dist/agents/generic-retry.js";

function requestFixture() {
  return {
    request_id:
      "req-retry",

    subject: {
      provider: "stripe",
      resource_type: "payment",
      resource_id: "pi_123"
    },

    snapshot: {
      snapshot_id:
        "payment-v7",

      subject: {
        provider: "stripe",
        resource_type: "payment",
        resource_id: "pi_123"
      },

      version:
        "state-v7",

      observed_at:
        "2026-11-01T19:00:00Z"
    },

    proposed_action: {
      namespace: "stripe",
      action: "refund_payment",

      parameters: {
        amount: 2500
      }
    },

    policy: {
      policy_id:
        "refund-safety",

      version: "1.0.0",

      name:
        "Refund safety",

      objective:
        "Verify refund.",

      decision_rules: [
        "Refundability must be verified."
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
      "2026-11-01T19:01:00Z"
  };
}

function initialWorkerOutput() {
  return {
    assembled_at:
      "2026-11-01T19:02:00Z",

    evidence: [
      {
        evidence_id: "E1",

        source_snapshot: {
          snapshot_id:
            "payment-read",

          subject: {
            provider: "stripe",
            resource_type: "payment",
            resource_id: "pi_123"
          },

          version:
            "state-v7",

          observed_at:
            "2026-11-01T19:01:30Z"
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
          "SUPPORTING",

        status:
          "SUPPORTED",

        evidence_refs:
          ["E1"]
      },

      {
        claim_id: "C2",

        statement:
          "Requested amount remains refundable.",

        criticality:
          "REQUIRED",

        status:
          "UNKNOWN",

        evidence_refs:
          []
      }
    ],

    decision:
      "UNKNOWN",

    confidence:
      0.5,

    summary:
      "Refundability remains unverified.",

    assessed_at:
      "2026-11-01T19:03:00Z"
  };
}

function context() {
  const request =
    requestFixture();

  const worker =
    materializeGenericWorkerOutputV2(
      initialWorkerOutput(),
      request
    );

  const guard =
    materializeGenericGuardOutputV2(
      {
        verdict: "REVIEW",
        risk: "MEDIUM",

        verified_claims:
          ["C1"],

        unverified_claims:
          ["C2"],

        contradicted_claims:
          [],

        findings: [
          {
            finding_id: "F1",

            type:
              "MISSING_EVIDENCE",

            severity:
              "MEDIUM",

            claim_id:
              "C2",

            description:
              "Refundability needs an independent read.",

            required_check:
              "Read the current refund history for the payment."
          }
        ],

        requested_checks: [
          {
            finding_id: "F1",

            check:
              "Read the current refund history for the payment."
          }
        ],

        worker_decision_supported:
          false,

        retry_recommended:
          true,

        summary:
          "Targeted evidence recovery is required.",

        verified_at:
          "2026-11-01T19:04:00Z"
      },
      request,
      worker.evidence,
      worker.assessment
    );

  return {
    request,
    evidence:
      worker.evidence,
    worker:
      worker.assessment,
    guard
  };
}

function retryOutput() {
  const previous =
    initialWorkerOutput();

  return {
    assembled_at:
      "2026-11-01T19:05:30Z",

    evidence: [
      ...previous.evidence,

      {
        evidence_id: "E2",

        source_snapshot: {
          snapshot_id:
            "refund-history-read",

          subject: {
            provider: "stripe",
            resource_type:
              "refund_history",
            resource_id:
              "pi_123"
          },

          version:
            "history-v5",

          observed_at:
            "2026-11-01T19:05:00Z"
        },

        locator:
          "stripe.refunds.pi_123",

        observation:
          "Requested amount remains refundable.",

        level:
          "OUTPUT_OBSERVED"
      }
    ],

    claims: [
      previous.claims[0],

      {
        ...previous.claims[1],

        status:
          "SUPPORTED",

        evidence_refs:
          ["E2"]
      }
    ],

    decision:
      "READY",

    confidence:
      0.9,

    summary:
      "Targeted recovery verified refundability.",

    assessed_at:
      "2026-11-01T19:06:00Z"
  };
}

test(
  "retry prompt contains only a targeted recovery mission",
  () => {
    const values =
      context();

    const prompt =
      buildGenericWorkerRetryPrompt(
        values.request,
        values.evidence,
        values.worker,
        values.guard
      );

    assert.match(
      prompt,
      /TARGETED EVIDENCE RECOVERY/
    );

    assert.match(
      prompt,
      /Read the current refund history/
    );
  }
);

test(
  "retry prompt has no Git-specific lock fields",
  () => {
    const values =
      context();

    const prompt =
      buildGenericWorkerRetryPrompt(
        values.request,
        values.evidence,
        values.worker,
        values.guard
      );

    assert.doesNotMatch(
      prompt,
      /locked_sha/
    );

    assert.doesNotMatch(
      prompt,
      /target_sha/
    );
  }
);

test(
  "materializes targeted retry with monotonic evidence history",
  () => {
    const values =
      context();

    const result =
      materializeGenericWorkerRetryOutputV2(
        retryOutput(),
        values.request,
        values.evidence,
        values.worker,
        values.guard
      );

    assert.deepEqual(
      result.added_evidence_ids,
      ["E2"]
    );

    assert.equal(
      result.assessment.decision,
      "READY"
    );
  }
);

test(
  "retry cannot remove previous evidence",
  () => {
    const values =
      context();

    const output =
      retryOutput();

    output.evidence =
      output.evidence.filter(
        (item) =>
          item.evidence_id !==
          "E1"
      );

    assert.throws(
      () =>
        materializeGenericWorkerRetryOutputV2(
          output,
          values.request,
          values.evidence,
          values.worker,
          values.guard
        ),
      /cannot remove existing evidence_id: E1/
    );
  }
);

test(
  "retry cannot rewrite previous evidence",
  () => {
    const values =
      context();

    const output =
      retryOutput();

    output.evidence[0]
      .observation =
      "Rewritten history.";

    assert.throws(
      () =>
        materializeGenericWorkerRetryOutputV2(
          output,
          values.request,
          values.evidence,
          values.worker,
          values.guard
        ),
      /cannot modify existing evidence_id: E1/
    );
  }
);

test(
  "retry cannot remove an existing claim",
  () => {
    const values =
      context();

    const output =
      retryOutput();

    output.claims =
      output.claims.filter(
        (claim) =>
          claim.claim_id !==
          "C1"
      );

    assert.throws(
      () =>
        materializeGenericWorkerRetryOutputV2(
          output,
          values.request,
          values.evidence,
          values.worker,
          values.guard
        ),
      /cannot remove existing claim_id: C1/
    );
  }
);

test(
  "retry cannot rewrite an existing claim statement",
  () => {
    const values =
      context();

    const output =
      retryOutput();

    output.claims[1]
      .statement =
      "Different statement.";

    assert.throws(
      () =>
        materializeGenericWorkerRetryOutputV2(
          output,
          values.request,
          values.evidence,
          values.worker,
          values.guard
        ),
      /cannot modify statement/
    );
  }
);

test(
  "retry cannot change existing claim criticality",
  () => {
    const values =
      context();

    const output =
      retryOutput();

    output.claims[1]
      .criticality =
      "SUPPORTING";

    assert.throws(
      () =>
        materializeGenericWorkerRetryOutputV2(
          output,
          values.request,
          values.evidence,
          values.worker,
          values.guard
        ),
      /cannot modify criticality/
    );
  }
);

test(
  "retry cannot drop an existing evidence reference",
  () => {
    const values =
      context();

    const output =
      retryOutput();

    output.claims[0]
      .evidence_refs =
      [];

    assert.throws(
      () =>
        materializeGenericWorkerRetryOutputV2(
          output,
          values.request,
          values.evidence,
          values.worker,
          values.guard
        ),
      /cannot remove existing evidence reference E1/
    );
  }
);

test(
  "new retry evidence must be observed after Guard REVIEW",
  () => {
    const values =
      context();

    const output =
      retryOutput();

    output.evidence[1]
      .source_snapshot
      .observed_at =
      "2026-11-01T19:03:30Z";

    assert.throws(
      () =>
        materializeGenericWorkerRetryOutputV2(
          output,
          values.request,
          values.evidence,
          values.worker,
          values.guard
        ),
      /must be observed after ContextGuard REVIEW/
    );
  }
);

test(
  "retry bundle cannot be assembled before Guard REVIEW",
  () => {
    const values =
      context();

    const output =
      retryOutput();

    output.assembled_at =
      "2026-11-01T19:03:30Z";

    assert.throws(
      () =>
        materializeGenericWorkerRetryOutputV2(
          output,
          values.request,
          values.evidence,
          values.worker,
          values.guard
        ),
      /cannot be assembled before ContextGuard REVIEW/
    );
  }
);

test(
  "retry may add a genuinely new claim",
  () => {
    const values =
      context();

    const output =
      retryOutput();

    output.claims.push({
      claim_id: "C3",

      statement:
        "No previous refund consumed the amount.",

      criticality:
        "SUPPORTING",

      status:
        "SUPPORTED",

      evidence_refs:
        ["E2"]
    });

    const result =
      materializeGenericWorkerRetryOutputV2(
        output,
        values.request,
        values.evidence,
        values.worker,
        values.guard
      );

    assert.deepEqual(
      result.added_claim_ids,
      ["C3"]
    );
  }
);

test(
  "retry remains fail-closed when requested evidence is still unavailable",
  () => {
    const values =
      context();

    const previous =
      initialWorkerOutput();

    const output = {
      ...previous,

      assembled_at:
        "2026-11-01T19:05:00Z",

      assessed_at:
        "2026-11-01T19:05:30Z",

      summary:
        "Targeted check could not retrieve the required evidence."
    };

    const result =
      materializeGenericWorkerRetryOutputV2(
        output,
        values.request,
        values.evidence,
        values.worker,
        values.guard
      );

    assert.equal(
      result.assessment.decision,
      "UNKNOWN"
    );

    assert.deepEqual(
      result.added_evidence_ids,
      []
    );
  }
);

test(
  "retry is rejected when Guard did not request retry",
  () => {
    const values =
      context();

    const guard = {
      ...values.guard,

      verdict: "PASS",

      risk: "LOW",

      verified_claims:
        ["C1"],

      unverified_claims:
        ["C2"],

      findings: [],

      requested_checks: [],

      worker_decision_supported:
        true,

      retry_recommended:
        false,

      summary:
        "UNKNOWN remains supported."
    };

    assert.throws(
      () =>
        buildGenericWorkerRetryPrompt(
          values.request,
          values.evidence,
          values.worker,
          guard
        ),
      /requires Guard verdict REVIEW/
    );
  }
);

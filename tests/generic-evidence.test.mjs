import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizationRequestDigest
} from "../dist/core/authorization-integrity.js";

import {
  evidenceProtocolDigest,
  validateEvidenceProtocolV2
} from "../dist/core/evidence.js";

function requestFixture() {
  return {
    request_id:
      "refund-request-001",

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
        resource_type:
          "payment",
        resource_id:
          "pi_123"
      },

      version:
        "state-v7",

      observed_at:
        "2026-11-01T18:00:30Z"
    },

    proposed_action: {
      namespace: "stripe",
      action:
        "refund_payment",

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
        "Authorize only verified refunds.",

      decision_rules: [
        "Payment must exist.",
        "Refund amount must remain available."
      ],

      human_approval:
        "REQUIRED",

      preflight_required:
        true,

      freshness: {
        max_age_seconds: 120
      }
    },

    runtime: {
      platform: "cominty",

      worker_agent_id:
        "worker-001",

      guard_agent_id:
        "guard-001",

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
          snapshot_id:
            "payment-state-7",

          subject: {
            provider: "stripe",
            resource_type:
              "payment",
            resource_id:
              "pi_123"
          },

          version: "state-v7",

          observed_at:
            "2026-11-01T18:01:30Z"
        },

        locator:
          "stripe.payment.pi_123",

        observation:
          "Payment exists and is succeeded.",

        level:
          "OUTPUT_OBSERVED"
      },

      {
        evidence_id: "E2",

        source_snapshot: {
          snapshot_id:
            "refund-history-v4",

          subject: {
            provider: "stripe",
            resource_type:
              "refund_history",
            resource_id:
              "pi_123"
          },

          version:
            "history-v4",

          observed_at:
            "2026-11-01T18:01:40Z"
        },

        locator:
          "stripe.refunds.for-payment.pi_123",

        observation:
          "No prior refund consumes the requested refundable amount.",

        level:
          "OUTPUT_OBSERVED"
      }
    ],

    claims: [
      {
        claim_id: "C1",

        statement:
          "The payment exists and succeeded.",

        criticality:
          "REQUIRED",

        status:
          "SUPPORTED",

        evidence_refs:
          ["E1"]
      },

      {
        claim_id: "C2",

        statement:
          "The requested amount remains refundable.",

        criticality:
          "REQUIRED",

        status:
          "SUPPORTED",

        evidence_refs:
          ["E2"]
      }
    ]
  };
}

test(
  "accepts evidence from multiple related resources",
  () => {
    const request =
      requestFixture();

    const bundle =
      validateEvidenceProtocolV2(
        evidenceFixture(request),
        request
      );

    assert.equal(
      bundle.evidence.length,
      2
    );

    assert.equal(
      bundle.evidence[1]
        .source_snapshot
        .subject
        .resource_type,
      "refund_history"
    );
  }
);

test(
  "binds the evidence bundle to the exact authorization request",
  () => {
    const request =
      requestFixture();

    const bundle =
      evidenceFixture(request);

    const changed =
      requestFixture();

    changed
      .proposed_action
      .parameters
      .amount =
      5000;

    assert.throws(
      () =>
        validateEvidenceProtocolV2(
          bundle,
          changed
        ),
      /different AuthorizationRequest/
    );
  }
);

test(
  "accepts a GitHub source snapshot without Git-specific core fields",
  () => {
    const request =
      requestFixture();

    const bundle =
      evidenceFixture(request);

    bundle.evidence.push({
      evidence_id: "E3",

      source_snapshot: {
        snapshot_id:
          "github-run-123",

        subject: {
          provider: "github",
          resource_type:
            "workflow_run",
          resource_id:
            "37930694308"
        },

        version:
          "attempt-1",

        observed_at:
          "2026-11-01T18:01:45Z"
      },

      locator:
        "github.actions.run.37930694308",

      observation:
        "Workflow run completed successfully.",

      level:
        "SUCCESS"
    });

    const validated =
      validateEvidenceProtocolV2(
        bundle,
        request
      );

    assert.equal(
      validated
        .evidence[2]
        .source_snapshot
        .subject.provider,
      "github"
    );
  }
);

test(
  "rejects duplicate evidence ids",
  () => {
    const request =
      requestFixture();

    const bundle =
      evidenceFixture(request);

    bundle.evidence[1]
      .evidence_id =
      "E1";

    assert.throws(
      () =>
        validateEvidenceProtocolV2(
          bundle,
          request
        ),
      /Duplicate evidence_id/
    );
  }
);

test(
  "rejects duplicate claim ids",
  () => {
    const request =
      requestFixture();

    const bundle =
      evidenceFixture(request);

    bundle.claims[1]
      .claim_id =
      "C1";

    assert.throws(
      () =>
        validateEvidenceProtocolV2(
          bundle,
          request
        ),
      /Duplicate claim_id/
    );
  }
);

test(
  "rejects references to unknown evidence",
  () => {
    const request =
      requestFixture();

    const bundle =
      evidenceFixture(request);

    bundle.claims[0]
      .evidence_refs =
      ["MISSING"];

    assert.throws(
      () =>
        validateEvidenceProtocolV2(
          bundle,
          request
        ),
      /unknown evidence_id/
    );
  }
);

test(
  "supported claims require evidence",
  () => {
    const request =
      requestFixture();

    const bundle =
      evidenceFixture(request);

    bundle.claims[0]
      .evidence_refs =
      [];

    assert.throws(
      () =>
        validateEvidenceProtocolV2(
          bundle,
          request
        ),
      /requires evidence/
    );
  }
);

test(
  "UNKNOWN claim may remain without evidence",
  () => {
    const request =
      requestFixture();

    const bundle =
      evidenceFixture(request);

    bundle.claims[0].status =
      "UNKNOWN";

    bundle.claims[0]
      .evidence_refs =
      [];

    assert.doesNotThrow(
      () =>
        validateEvidenceProtocolV2(
          bundle,
          request
        )
    );
  }
);

test(
  "rejects stale decision-critical evidence",
  () => {
    const request =
      requestFixture();

    const bundle =
      evidenceFixture(request);

    bundle.evidence[0]
      .source_snapshot
      .observed_at =
      "2026-11-01T17:00:00Z";

    assert.throws(
      () =>
        validateEvidenceProtocolV2(
          bundle,
          request
        ),
      /stale decision-critical evidence/
    );
  }
);

test(
  "stale supporting evidence does not fail global freshness",
  () => {
    const request =
      requestFixture();

    const bundle =
      evidenceFixture(request);

    bundle.evidence.push({
      evidence_id: "E3",

      source_snapshot: {
        snapshot_id:
          "historical-record",

        subject: {
          provider: "crm",
          resource_type:
            "account",
          resource_id:
            "acct-1"
        },

        version: "1",

        observed_at:
          "2025-01-01T00:00:00Z"
      },

      locator:
        "crm.account.acct-1",

      observation:
        "Historical supporting context.",

      level:
        "OUTPUT_OBSERVED"
    });

    bundle.claims.push({
      claim_id: "C3",

      statement:
        "Historical account context exists.",

      criticality:
        "SUPPORTING",

      status:
        "SUPPORTED",

      evidence_refs:
        ["E3"]
    });

    assert.doesNotThrow(
      () =>
        validateEvidenceProtocolV2(
          bundle,
          request
        )
    );
  }
);

test(
  "rejects evidence observed after bundle assembly",
  () => {
    const request =
      requestFixture();

    const bundle =
      evidenceFixture(request);

    bundle.evidence[0]
      .source_snapshot
      .observed_at =
      "2026-11-01T18:03:00Z";

    assert.throws(
      () =>
        validateEvidenceProtocolV2(
          bundle,
          request
        ),
      /after bundle assembly/
    );
  }
);

test(
  "rejects malformed content hashes",
  () => {
    const request =
      requestFixture();

    const bundle =
      evidenceFixture(request);

    bundle.evidence[0]
      .content_hash =
      "not-a-hash";

    assert.throws(
      () =>
        validateEvidenceProtocolV2(
          bundle,
          request
        ),
      /SHA-256/
    );
  }
);

test(
  "evidence digest is stable for identical bundles",
  () => {
    const request =
      requestFixture();

    assert.equal(
      evidenceProtocolDigest(
        evidenceFixture(request),
        request
      ),

      evidenceProtocolDigest(
        evidenceFixture(request),
        request
      )
    );
  }
);

test(
  "evidence tampering changes the evidence digest",
  () => {
    const request =
      requestFixture();

    const original =
      evidenceFixture(request);

    const changed =
      evidenceFixture(request);

    changed.evidence[0]
      .observation =
      "Different observation.";

    assert.notEqual(
      evidenceProtocolDigest(
        original,
        request
      ),

      evidenceProtocolDigest(
        changed,
        request
      )
    );
  }
);

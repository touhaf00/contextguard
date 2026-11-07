import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizationRequestDigest,
  createAuthorizationEnvelope,
  validateAuthorizationEnvelope,
  verifyAuthorizationEnvelope
} from "../dist/core/authorization-integrity.js";

function requestFixture() {
  return {
    request_id:
      "req-generic-001",

    subject: {
      provider:
        "stripe",

      resource_type:
        "payment",

      resource_id:
        "pi_123"
    },

    snapshot: {
      snapshot_id:
        "payment-snapshot-v7",

      subject: {
        provider:
          "stripe",

        resource_type:
          "payment",

        resource_id:
          "pi_123"
      },

      version:
        "state-v7",

      observed_at:
        "2026-11-01T18:00:00Z"
    },

    proposed_action: {
      namespace:
        "stripe",

      action:
        "refund_payment",

      parameters: {
        amount:
          2500,

        currency:
          "EUR"
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
        "Authorize only verified refunds.",

      decision_rules: [
        "The payment must exist.",
        "The requested amount must be refundable."
      ],

      human_approval:
        "REQUIRED",

      preflight_required:
        true,

      freshness: {
        max_age_seconds:
          60
      }
    },

    runtime: {
      platform:
        "cominty",

      worker_agent_id:
        "worker-001",

      guard_agent_id:
        "guard-001",

      tool_scope: [
        "stripe.read",
        "stripe.refunds.read"
      ]
    },

    requested_at:
      "2026-11-01T18:01:00Z",

    context: {
      tenant:
        "example-tenant"
    }
  };
}

test(
  "produces a stable digest for the same authorization request",
  () => {
    const first =
      authorizationRequestDigest(
        requestFixture()
      );

    const second =
      authorizationRequestDigest(
        requestFixture()
      );

    assert.equal(
      first,
      second
    );

    assert.match(
      first,
      /^[0-9a-f]{64}$/
    );
  }
);

test(
  "object key order does not change authorization request digest",
  () => {
    const first =
      requestFixture();

    const second =
      requestFixture();

    second.proposed_action =
      {
        parameters: {
          currency:
            "EUR",

          amount:
            2500
        },

        action:
          "refund_payment",

        namespace:
          "stripe"
      };

    assert.equal(
      authorizationRequestDigest(
        first
      ),
      authorizationRequestDigest(
        second
      )
    );
  }
);

test(
  "changing action parameters changes request digest",
  () => {
    const original =
      requestFixture();

    const changed =
      requestFixture();

    changed
      .proposed_action
      .parameters
      .amount =
      5000;

    assert.notEqual(
      authorizationRequestDigest(
        original
      ),
      authorizationRequestDigest(
        changed
      )
    );
  }
);

test(
  "changing resource snapshot changes request digest",
  () => {
    const original =
      requestFixture();

    const changed =
      requestFixture();

    changed.snapshot.version =
      "state-v8";

    assert.notEqual(
      authorizationRequestDigest(
        original
      ),
      authorizationRequestDigest(
        changed
      )
    );
  }
);

test(
  "changing policy version changes request digest",
  () => {
    const original =
      requestFixture();

    const changed =
      requestFixture();

    changed.policy.version =
      "2.0.0";

    assert.notEqual(
      authorizationRequestDigest(
        original
      ),
      authorizationRequestDigest(
        changed
      )
    );
  }
);

test(
  "changing Guard identity changes request digest",
  () => {
    const original =
      requestFixture();

    const changed =
      requestFixture();

    changed.runtime
      .guard_agent_id =
      "guard-002";

    assert.notEqual(
      authorizationRequestDigest(
        original
      ),
      authorizationRequestDigest(
        changed
      )
    );
  }
);

test(
  "changing tool scope changes request digest",
  () => {
    const original =
      requestFixture();

    const changed =
      requestFixture();

    changed.runtime
      .tool_scope = [
        "stripe.read",
        "stripe.refunds.read",
        "stripe.write"
      ];

    assert.notEqual(
      authorizationRequestDigest(
        original
      ),
      authorizationRequestDigest(
        changed
      )
    );
  }
);

test(
  "creates and verifies a versioned authorization envelope",
  () => {
    const envelope =
      createAuthorizationEnvelope(
        requestFixture(),
        {
          issuedAt:
            "2026-11-01T18:02:00Z"
        }
      );

    assert.equal(
      envelope.envelope_version,
      "1"
    );

    assert.equal(
      verifyAuthorizationEnvelope(
        envelope
      ),
      true
    );

    const validated =
      validateAuthorizationEnvelope(
        envelope
      );

    assert.equal(
      validated.request_digest,
      envelope.request_digest
    );
  }
);

test(
  "detects embedded request tampering",
  () => {
    const envelope =
      createAuthorizationEnvelope(
        requestFixture(),
        {
          issuedAt:
            "2026-11-01T18:02:00Z"
        }
      );

    envelope
      .request
      .proposed_action
      .parameters
      .amount =
      9999;

    assert.equal(
      verifyAuthorizationEnvelope(
        envelope
      ),
      false
    );
  }
);

test(
  "detects envelope metadata tampering",
  () => {
    const envelope =
      createAuthorizationEnvelope(
        requestFixture(),
        {
          issuedAt:
            "2026-11-01T18:02:00Z"
        }
      );

    envelope.issued_at =
      "2026-11-01T19:02:00Z";

    assert.equal(
      verifyAuthorizationEnvelope(
        envelope
      ),
      false
    );
  }
);

test(
  "rejects an unsupported envelope version",
  () => {
    const envelope =
      createAuthorizationEnvelope(
        requestFixture()
      );

    envelope.envelope_version =
      "2";

    assert.equal(
      verifyAuthorizationEnvelope(
        envelope
      ),
      false
    );
  }
);

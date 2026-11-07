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
  evaluateGenericAuthorizationApiV2
} from "../dist/api/v2/authorization.js";

import {
  AuthorizationSessionStoreErrorV2,
  AuthorizationSessionStoreV2,
  authorizationSessionDescriptorV2,
  validateAuthorizationSessionV2
} from "../dist/api/v2/session-store.js";

function buildResponse(
  humanApproval =
    "REQUIRED",

  lockId =
    "lock-session"
) {
  const subject = {
    provider:
      "stripe",

    resource_type:
      "payment",

    resource_id:
      "pi_session"
  };

  const request = {
    request_id:
      `req-${lockId}`,

    subject,

    snapshot: {
      snapshot_id:
        "payment-v1",

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
        humanApproval,

      preflight_required:
        true
    },

    runtime: {
      platform:
        "cominty",

      worker_agent_id:
        "worker-session",

      guard_agent_id:
        "guard-session",

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
          "Payment remains refundable.",

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
      "Payment remains refundable.",

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
      "Worker decision is supported.",

    verified_at:
      "2026-11-01T23:14:00Z"
  };

  return evaluateGenericAuthorizationApiV2(
    {
      request,
      evidence,

      worker_assessment:
        worker,

      guard_verification:
        guard
    },
    {
      intentId:
        `intent-${lockId}`,

      lockId,

      lockCreatedAt:
        "2026-11-01T23:15:00Z"
    }
  );
}

function store(
  now = () =>
    new Date(
      "2026-11-01T23:16:00Z"
    )
) {
  return new AuthorizationSessionStoreV2({
    now,

    ttlMs:
      5 * 60 * 1000,

    capacity:
      10
  });
}

test(
  "creates an awaiting-approval session for required human approval",
  () => {
    const sessions =
      store();

    const session =
      sessions.create(
        buildResponse(),
        {
          sessionId:
            "session-required"
        }
      );

    assert.equal(
      session.session_state,
      "AWAITING_HUMAN_APPROVAL"
    );

    assert.equal(
      session.lock_id,
      "lock-session"
    );

    assert.equal(
      validateAuthorizationSessionV2(
        session
      ).session_id,
      "session-required"
    );
  }
);

test(
  "policy NONE creates a session ready for preflight",
  () => {
    const session =
      store().create(
        buildResponse(
          "NONE",
          "lock-none"
        ),
        {
          sessionId:
            "session-none"
        }
      );

    assert.equal(
      session.session_state,
      "READY_FOR_PREFLIGHT"
    );
  }
);

test(
  "session descriptor exposes only continuation identifiers",
  () => {
    const session =
      store().create(
        buildResponse(),
        {
          sessionId:
            "session-descriptor"
        }
      );

    const descriptor =
      authorizationSessionDescriptorV2(
        session
      );

    assert.equal(
      descriptor.session_id,
      "session-descriptor"
    );

    assert.equal(
      descriptor.lock_fingerprint,
      session.lock_fingerprint
    );

    assert.equal(
      "lock" in descriptor,
      false
    );

    assert.equal(
      "session_digest" in descriptor,
      false
    );
  }
);

test(
  "returned session cannot mutate stored ActionLock",
  () => {
    const sessions =
      store();

    const session =
      sessions.create(
        buildResponse(),
        {
          sessionId:
            "session-detached"
        }
      );

    session.lock
      .intent
      .request
      .proposed_action
      .parameters.amount =
      9999;

    const stored =
      sessions.get(
        "session-detached"
      );

    assert.equal(
      stored.lock
        .intent
        .request
        .proposed_action
        .parameters.amount,
      2500
    );
  }
);

test(
  "get returns detached copies",
  () => {
    const sessions =
      store();

    sessions.create(
      buildResponse(),
      {
        sessionId:
          "session-read"
      }
    );

    const first =
      sessions.get(
        "session-read"
      );

    first.request_id =
      "tampered";

    const second =
      sessions.get(
        "session-read"
      );

    assert.notEqual(
      second.request_id,
      "tampered"
    );
  }
);

test(
  "tampered authorization response cannot create a session",
  () => {
    const response =
      buildResponse();

    response.lock
      .intent
      .request
      .proposed_action
      .parameters.amount =
      9999;

    assert.throws(
      () =>
        store().create(
          response
        ),
      (error) =>
        error instanceof
          AuthorizationSessionStoreErrorV2 &&
        error.code ===
          "INVALID_RESPONSE"
    );
  }
);

test(
  "response status must match the locked deterministic decision",
  () => {
    const response =
      buildResponse();

    response.status =
      "AUTHORIZED_BY_POLICY";

    assert.throws(
      () =>
        store().create(
          response
        ),
      (error) =>
        error instanceof
          AuthorizationSessionStoreErrorV2 &&
        error.code ===
          "INVALID_RESPONSE"
    );
  }
);

test(
  "same ActionLock cannot create two active sessions",
  () => {
    const sessions =
      store();

    const response =
      buildResponse();

    sessions.create(
      response,
      {
        sessionId:
          "session-a"
      }
    );

    assert.throws(
      () =>
        sessions.create(
          response,
          {
            sessionId:
              "session-b"
          }
        ),
      (error) =>
        error instanceof
          AuthorizationSessionStoreErrorV2 &&
        error.code ===
          "DUPLICATE_LOCK"
    );
  }
);

test(
  "expired session fails closed and is removed",
  () => {
    let nowMs =
      Date.parse(
        "2026-11-01T23:16:00Z"
      );

    const sessions =
      store(
        () =>
          new Date(nowMs)
      );

    sessions.create(
      buildResponse(),
      {
        sessionId:
          "session-expiring",

        ttlMs:
          60_000
      }
    );

    nowMs =
      Date.parse(
        "2026-11-01T23:17:00Z"
      );

    assert.throws(
      () =>
        sessions.get(
          "session-expiring"
        ),
      (error) =>
        error instanceof
          AuthorizationSessionStoreErrorV2 &&
        error.code ===
          "EXPIRED"
    );

    assert.equal(
      sessions.size(),
      0
    );
  }
);

test(
  "capacity limit fails closed",
  () => {
    const sessions =
      new AuthorizationSessionStoreV2({
        now: () =>
          new Date(
            "2026-11-01T23:16:00Z"
          ),

        ttlMs:
          5 * 60 * 1000,

        capacity:
          1
      });

    sessions.create(
      buildResponse(
        "REQUIRED",
        "lock-capacity-a"
      ),
      {
        sessionId:
          "session-capacity-a"
      }
    );

    assert.throws(
      () =>
        sessions.create(
          buildResponse(
            "REQUIRED",
            "lock-capacity-b"
          ),
          {
            sessionId:
              "session-capacity-b"
          }
        ),
      (error) =>
        error instanceof
          AuthorizationSessionStoreErrorV2 &&
        error.code ===
          "CAPACITY_REACHED"
    );
  }
);

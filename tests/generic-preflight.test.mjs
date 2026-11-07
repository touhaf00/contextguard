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
  createGenericActionLockV2
} from "../dist/core/action-lock.js";

import {
  createApprovalAttestationV2
} from "../dist/core/approval-attestation.js";

import {
  GenericPreflightError,
  performGenericPreflightV2
} from "../dist/core/preflight.js";

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

function fixtures(
  humanApproval = "REQUIRED",
  integrityHash = undefined
) {
  const request = {
    request_id:
      "req-preflight-1",

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
        resource_type: "payment",
        resource_id: "pi_123"
      },

      version:
        "state-v7",

      observed_at:
        "2026-11-01T18:00:00Z",

      ...(integrityHash
        ? {
            integrity_hash:
              integrityHash
          }
        : {})
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
      policy_id:
        "refund-safety",

      version: "1.0.0",

      name:
        "Refund safety",

      objective:
        "Verify refund conditions.",

      decision_rules: [
        "Payment must exist."
      ],

      human_approval:
        humanApproval,

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
          snapshot_id:
            "payment-evidence-v7",

          subject: {
            provider: "stripe",
            resource_type: "payment",
            resource_id: "pi_123"
          },

          version:
            "state-v7",

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
          "Payment exists.",

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

  const lock =
    createGenericActionLockV2(
      request,
      evidence,
      worker,
      guard,
      {
        intentId:
          "intent-preflight-1",

        lockId:
          "lock-preflight-1",

        createdAt:
          "2026-11-01T18:05:00Z"
      }
    );

  return {
    request,
    evidence,
    worker,
    guard,
    lock
  };
}

const principal = {
  principal_type:
    "HUMAN",

  principal_id:
    "operator-123",

  authentication_method:
    "authenticated-session"
};

function approvedAttestation(
  lock,
  ttlMs =
    10 * 60 * 1000
) {
  return createApprovalAttestationV2(
    lock,
    principal,
    "APPROVED",
    {
      approvalId:
        "approval-preflight-1",

      decidedAt:
        "2026-11-01T18:06:00Z",

      ttlMs
    }
  );
}

function observation(
  values
) {
  return {
    snapshot: {
      ...clone(
        values.request.snapshot
      ),

      snapshot_id:
        "preflight-observation",

      observed_at:
        "2026-11-01T18:07:00Z"
    },

    proposed_action:
      clone(
        values.request
          .proposed_action
      ),

    policy:
      clone(
        values.request.policy
      ),

    runtime:
      clone(
        values.request.runtime
      )
  };
}

function expectCode(
  fn,
  code
) {
  assert.throws(
    fn,
    (error) =>
      error instanceof
        GenericPreflightError &&
      error.code === code
  );
}

test(
  "verifies exact state immediately before execution",
  () => {
    const values =
      fixtures();

    const approval =
      approvedAttestation(
        values.lock
      );

    const result =
      performGenericPreflightV2(
        values.lock,
        approval,
        observation(values),
        {
          checkedAt:
            "2026-11-01T18:08:00Z"
        }
      );

    assert.equal(
      result.status,
      "PRE_EXECUTION_VERIFIED"
    );

    assert.equal(
      result.approval_verified,
      true
    );

    assert.equal(
      result.external_action_executed,
      false
    );
  }
);

test(
  "required approval cannot be omitted",
  () => {
    const values =
      fixtures();

    expectCode(
      () =>
        performGenericPreflightV2(
          values.lock,
          undefined,
          observation(values),
          {
            checkedAt:
              "2026-11-01T18:08:00Z"
          }
        ),
      "APPROVAL_REQUIRED"
    );
  }
);

test(
  "explicit human rejection blocks preflight",
  () => {
    const values =
      fixtures();

    const rejected =
      createApprovalAttestationV2(
        values.lock,
        principal,
        "REJECTED",
        {
          approvalId:
            "approval-rejected",

          decidedAt:
            "2026-11-01T18:06:00Z"
        }
      );

    expectCode(
      () =>
        performGenericPreflightV2(
          values.lock,
          rejected,
          observation(values),
          {
            checkedAt:
              "2026-11-01T18:08:00Z"
          }
        ),
      "APPROVAL_REJECTED"
    );
  }
);

test(
  "expired human approval blocks preflight",
  () => {
    const values =
      fixtures();

    const approval =
      approvedAttestation(
        values.lock,
        60 * 1000
      );

    expectCode(
      () =>
        performGenericPreflightV2(
          values.lock,
          approval,
          observation(values),
          {
            checkedAt:
              "2026-11-01T18:07:00Z"
          }
        ),
      "APPROVAL_EXPIRED"
    );
  }
);

test(
  "tampered approval attestation blocks preflight",
  () => {
    const values =
      fixtures();

    const approval =
      approvedAttestation(
        values.lock
      );

    approval.principal
      .principal_id =
      "attacker";

    expectCode(
      () =>
        performGenericPreflightV2(
          values.lock,
          approval,
          observation(values),
          {
            checkedAt:
              "2026-11-01T18:08:00Z"
          }
        ),
      "APPROVAL_INVALID"
    );
  }
);

test(
  "subject drift blocks preflight",
  () => {
    const values =
      fixtures();

    const approval =
      approvedAttestation(
        values.lock
      );

    const current =
      observation(values);

    current.snapshot
      .subject
      .resource_id =
      "pi_different";

    expectCode(
      () =>
        performGenericPreflightV2(
          values.lock,
          approval,
          current,
          {
            checkedAt:
              "2026-11-01T18:08:00Z"
          }
        ),
      "SUBJECT_CHANGED"
    );
  }
);

test(
  "resource version drift blocks preflight",
  () => {
    const values =
      fixtures();

    const approval =
      approvedAttestation(
        values.lock
      );

    const current =
      observation(values);

    current.snapshot.version =
      "state-v8";

    expectCode(
      () =>
        performGenericPreflightV2(
          values.lock,
          approval,
          current,
          {
            checkedAt:
              "2026-11-01T18:08:00Z"
          }
        ),
      "SNAPSHOT_CHANGED"
    );
  }
);

test(
  "content integrity hash drift blocks preflight",
  () => {
    const values =
      fixtures(
        "REQUIRED",
        "a".repeat(64)
      );

    const approval =
      approvedAttestation(
        values.lock
      );

    const current =
      observation(values);

    current.snapshot
      .integrity_hash =
      "b".repeat(64);

    expectCode(
      () =>
        performGenericPreflightV2(
          values.lock,
          approval,
          current,
          {
            checkedAt:
              "2026-11-01T18:08:00Z"
          }
        ),
      "SNAPSHOT_CHANGED"
    );
  }
);

test(
  "action parameter drift blocks preflight",
  () => {
    const values =
      fixtures();

    const approval =
      approvedAttestation(
        values.lock
      );

    const current =
      observation(values);

    current.proposed_action
      .parameters.amount =
      5000;

    expectCode(
      () =>
        performGenericPreflightV2(
          values.lock,
          approval,
          current,
          {
            checkedAt:
              "2026-11-01T18:08:00Z"
          }
        ),
      "ACTION_CHANGED"
    );
  }
);

test(
  "policy drift blocks preflight",
  () => {
    const values =
      fixtures();

    const approval =
      approvedAttestation(
        values.lock
      );

    const current =
      observation(values);

    current.policy.version =
      "2.0.0";

    expectCode(
      () =>
        performGenericPreflightV2(
          values.lock,
          approval,
          current,
          {
            checkedAt:
              "2026-11-01T18:08:00Z"
          }
        ),
      "POLICY_CHANGED"
    );
  }
);

test(
  "runtime identity drift blocks preflight",
  () => {
    const values =
      fixtures();

    const approval =
      approvedAttestation(
        values.lock
      );

    const current =
      observation(values);

    current.runtime
      .guard_agent_id =
      "guard-different";

    expectCode(
      () =>
        performGenericPreflightV2(
          values.lock,
          approval,
          current,
          {
            checkedAt:
              "2026-11-01T18:08:00Z"
          }
        ),
      "RUNTIME_CHANGED"
    );
  }
);

test(
  "snapshot observed before approval is not fresh enough",
  () => {
    const values =
      fixtures();

    const approval =
      approvedAttestation(
        values.lock
      );

    const current =
      observation(values);

    current.snapshot
      .observed_at =
      "2026-11-01T18:05:30Z";

    expectCode(
      () =>
        performGenericPreflightV2(
          values.lock,
          approval,
          current,
          {
            checkedAt:
              "2026-11-01T18:08:00Z"
          }
        ),
      "SNAPSHOT_NOT_FRESH"
    );
  }
);

test(
  "snapshot cannot come from the future relative to preflight",
  () => {
    const values =
      fixtures();

    const approval =
      approvedAttestation(
        values.lock
      );

    const current =
      observation(values);

    current.snapshot
      .observed_at =
      "2026-11-01T18:09:00Z";

    expectCode(
      () =>
        performGenericPreflightV2(
          values.lock,
          approval,
          current,
          {
            checkedAt:
              "2026-11-01T18:08:00Z"
          }
        ),
      "INVALID_OBSERVATION"
    );
  }
);

test(
  "policy NONE can preflight without human approval",
  () => {
    const values =
      fixtures(
        "NONE"
      );

    const result =
      performGenericPreflightV2(
        values.lock,
        undefined,
        observation(values),
        {
          checkedAt:
            "2026-11-01T18:08:00Z"
        }
      );

    assert.equal(
      result.status,
      "PRE_EXECUTION_VERIFIED"
    );

    assert.equal(
      result.approval_verified,
      false
    );
  }
);

test(
  "policy NONE rejects a supplied human attestation",
  () => {
    const required =
      fixtures(
        "REQUIRED"
      );

    const approval =
      approvedAttestation(
        required.lock
      );

    const values =
      fixtures(
        "NONE"
      );

    expectCode(
      () =>
        performGenericPreflightV2(
          values.lock,
          approval,
          observation(values),
          {
            checkedAt:
              "2026-11-01T18:08:00Z"
          }
        ),
      "APPROVAL_NOT_ALLOWED"
    );
  }
);

test(
  "policy OPTIONAL can preflight without human approval",
  () => {
    const values =
      fixtures(
        "OPTIONAL"
      );

    const result =
      performGenericPreflightV2(
        values.lock,
        undefined,
        observation(values),
        {
          checkedAt:
            "2026-11-01T18:08:00Z"
        }
      );

    assert.equal(
      result.status,
      "PRE_EXECUTION_VERIFIED"
    );

    assert.equal(
      result.approval_requirement,
      "OPTIONAL"
    );
  }
);

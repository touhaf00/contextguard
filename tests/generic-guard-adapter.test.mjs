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
  materializeGenericWorkerOutputV2
} from "../dist/agents/generic-worker.js";

import {
  buildGenericGuardPrompt,
  materializeGenericGuardOutputV2
} from "../dist/agents/generic-guard.js";

function requestFixture() {
  return {
    request_id:
      "req-guard-adapter",

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
        "2026-11-01T19:00:00Z"
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
        "Authorize only verified refunds.",

      decision_rules: [
        "Payment must exist."
      ],

      human_approval:
        "REQUIRED",

      preflight_required:
        true
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
      "2026-11-01T19:01:00Z"
  };
}

function workerOutputFixture() {
  return {
    assembled_at:
      "2026-11-01T19:02:00Z",

    evidence: [
      {
        evidence_id: "E1",

        source_snapshot: {
          snapshot_id:
            "payment-observation",

          subject: {
            provider: "stripe",
            resource_type: "payment",
            resource_id: "pi_123"
          },

          version: "state-v7",

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
          "REQUIRED",

        status:
          "SUPPORTED",

        evidence_refs:
          ["E1"]
      }
    ],

    decision:
      "READY",

    confidence:
      0.9,

    summary:
      "Required conditions are supported.",

    assessed_at:
      "2026-11-01T19:03:00Z"
  };
}

function pipeline() {
  const request =
    requestFixture();

  const workerResult =
    materializeGenericWorkerOutputV2(
      workerOutputFixture(),
      request
    );

  return {
    request,
    evidence:
      workerResult.evidence,
    worker:
      workerResult.assessment
  };
}

function guardOutputFixture() {
  return {
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
      "2026-11-01T19:04:00Z"
  };
}

test(
  "generic Guard prompt contains exact application bindings",
  () => {
    const values =
      pipeline();

    const prompt =
      buildGenericGuardPrompt(
        values.request,
        values.evidence,
        values.worker
      );

    assert.match(
      prompt,
      new RegExp(
        authorizationRequestDigest(
          values.request
        )
      )
    );

    assert.match(
      prompt,
      new RegExp(
        evidenceProtocolDigest(
          values.evidence,
          values.request
        )
      )
    );

    assert.match(
      prompt,
      new RegExp(
        workerAssessmentDigest(
          values.worker,
          values.evidence,
          values.request
        )
      )
    );
  }
);

test(
  "generic Guard prompt treats Worker output as untrusted data",
  () => {
    const values =
      pipeline();

    const prompt =
      buildGenericGuardPrompt(
        values.request,
        values.evidence,
        values.worker
      );

    assert.match(
      prompt,
      /UNTRUSTED DATA/
    );

    assert.match(
      prompt,
      /NOT permission to execute/
    );
  }
);

test(
  "generic Guard prompt has no Git target lock dependency",
  () => {
    const values =
      pipeline();

    const prompt =
      buildGenericGuardPrompt(
        values.request,
        values.evidence,
        values.worker
      );

    assert.doesNotMatch(
      prompt,
      /target_sha/
    );

    assert.doesNotMatch(
      prompt,
      /locked_sha/
    );
  }
);

test(
  "materializes PASS with application-computed cryptographic bindings",
  () => {
    const values =
      pipeline();

    const guard =
      materializeGenericGuardOutputV2(
        guardOutputFixture(),
        values.request,
        values.evidence,
        values.worker
      );

    assert.equal(
      guard.request_digest,
      authorizationRequestDigest(
        values.request
      )
    );

    assert.equal(
      guard.evidence_digest,
      evidenceProtocolDigest(
        values.evidence,
        values.request
      )
    );

    assert.equal(
      guard.worker_assessment_digest,
      workerAssessmentDigest(
        values.worker,
        values.evidence,
        values.request
      )
    );
  }
);

test(
  "materializer rejects model-supplied request digest",
  () => {
    const values =
      pipeline();

    const output =
      guardOutputFixture();

    output.request_digest =
      "0".repeat(64);

    assert.throws(
      () =>
        materializeGenericGuardOutputV2(
          output,
          values.request,
          values.evidence,
          values.worker
        ),
      /unsupported field: request_digest/
    );
  }
);

test(
  "materializer rejects model-supplied Worker digest",
  () => {
    const values =
      pipeline();

    const output =
      guardOutputFixture();

    output.worker_assessment_digest =
      "0".repeat(64);

    assert.throws(
      () =>
        materializeGenericGuardOutputV2(
          output,
          values.request,
          values.evidence,
          values.worker
        ),
      /unsupported field: worker_assessment_digest/
    );
  }
);

test(
  "materializer rejects model-supplied Guard digest",
  () => {
    const values =
      pipeline();

    const output =
      guardOutputFixture();

    output.guard_verification_digest =
      "0".repeat(64);

    assert.throws(
      () =>
        materializeGenericGuardOutputV2(
          output,
          values.request,
          values.evidence,
          values.worker
        ),
      /unsupported field: guard_verification_digest/
    );
  }
);

test(
  "legacy allowed_to_act field is rejected",
  () => {
    const values =
      pipeline();

    const output =
      guardOutputFixture();

    output.allowed_to_act =
      true;

    assert.throws(
      () =>
        materializeGenericGuardOutputV2(
          output,
          values.request,
          values.evidence,
          values.worker
        ),
      /unsupported field: allowed_to_act/
    );
  }
);

test(
  "unknown Worker claim classification is rejected",
  () => {
    const values =
      pipeline();

    const output =
      guardOutputFixture();

    output.verified_claims =
      ["C999"];

    assert.throws(
      () =>
        materializeGenericGuardOutputV2(
          output,
          values.request,
          values.evidence,
          values.worker
        ),
      /unknown Worker claim_id/
    );
  }
);

test(
  "claim cannot appear in multiple Guard classifications",
  () => {
    const values =
      pipeline();

    const output =
      guardOutputFixture();

    output.unverified_claims =
      ["C1"];

    assert.throws(
      () =>
        materializeGenericGuardOutputV2(
          output,
          values.request,
          values.evidence,
          values.worker
        ),
      /more than one Guard classification/
    );
  }
);

test(
  "READY plus PASS requires REQUIRED claims to be independently verified",
  () => {
    const values =
      pipeline();

    const output =
      guardOutputFixture();

    output.verified_claims =
      [];

    output.unverified_claims =
      ["C1"];

    assert.throws(
      () =>
        materializeGenericGuardOutputV2(
          output,
          values.request,
          values.evidence,
          values.worker
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

    const workerOutput =
      workerOutputFixture();

    workerOutput.claims[0].status =
      "UNKNOWN";

    workerOutput.claims[0]
      .evidence_refs =
      [];

    workerOutput.decision =
      "UNKNOWN";

    workerOutput.summary =
      "Decision-critical evidence remains unavailable.";

    const workerResult =
      materializeGenericWorkerOutputV2(
        workerOutput,
        request
      );

    const output =
      guardOutputFixture();

    output.verified_claims =
      [];

    output.unverified_claims =
      ["C1"];

    output.risk =
      "MEDIUM";

    output.summary =
      "The unresolved evidence gap supports UNKNOWN.";

    assert.doesNotThrow(
      () =>
        materializeGenericGuardOutputV2(
          output,
          request,
          workerResult.evidence,
          workerResult.assessment
        )
    );
  }
);

test(
  "targeted REVIEW with exact recovery check is accepted",
  () => {
    const values =
      pipeline();

    const output =
      guardOutputFixture();

    output.verdict =
      "REVIEW";

    output.risk =
      "MEDIUM";

    output.worker_decision_supported =
      false;

    output.retry_recommended =
      true;

    output.verified_claims =
      [];

    output.unverified_claims =
      ["C1"];

    output.findings = [
      {
        finding_id:
          "F1",

        type:
          "MISSING_EVIDENCE",

        severity:
          "MEDIUM",

        claim_id:
          "C1",

        description:
          "Independent confirmation is incomplete.",

        required_check:
          "Re-read the exact payment state."
      }
    ];

    output.requested_checks = [
      {
        finding_id:
          "F1",

        check:
          "Re-read the exact payment state."
      }
    ];

    assert.doesNotThrow(
      () =>
        materializeGenericGuardOutputV2(
          output,
          values.request,
          values.evidence,
          values.worker
        )
    );
  }
);

test(
  "material FAIL is accepted",
  () => {
    const values =
      pipeline();

    const output =
      guardOutputFixture();

    output.verdict =
      "FAIL";

    output.risk =
      "CRITICAL";

    output.worker_decision_supported =
      false;

    output.verified_claims =
      [];

    output.contradicted_claims =
      ["C1"];

    output.findings = [
      {
        finding_id:
          "F1",

        type:
          "FABRICATED_EVIDENCE",

        severity:
          "CRITICAL",

        claim_id:
          "C1",

        description:
          "Evidence could not exist as represented."
      }
    ];

    assert.doesNotThrow(
      () =>
        materializeGenericGuardOutputV2(
          output,
          values.request,
          values.evidence,
          values.worker
        )
    );
  }
);

test(
  "Guard verification cannot predate Worker assessment",
  () => {
    const values =
      pipeline();

    const output =
      guardOutputFixture();

    output.verified_at =
      "2026-11-01T19:02:30Z";

    assert.throws(
      () =>
        materializeGenericGuardOutputV2(
          output,
          values.request,
          values.evidence,
          values.worker
        ),
      /before the Worker assessment/
    );
  }
);


test(
  "server timestamps missing Guard verification metadata",
  () => {
    const values = pipeline();
    const output = guardOutputFixture();

    delete output.verified_at;

    const before = Date.now();

    const guard = materializeGenericGuardOutputV2(
      output,
      values.request,
      values.evidence,
      values.worker
    );

    const after = Date.now();
    const timestamp = Date.parse(guard.verified_at);

    assert.ok(Number.isFinite(timestamp));
    assert.ok(timestamp >= before);
    assert.ok(timestamp <= after);
  }
);

test(
  "invalid non-empty Guard timestamp still fails closed",
  () => {
    const values = pipeline();
    const output = guardOutputFixture();

    output.verified_at = "invalid-date";

    assert.throws(
      () => materializeGenericGuardOutputV2(
        output,
        values.request,
        values.evidence,
        values.worker
      ),
      /timestamp/
    );
  }
);


test(
  "future Guard timestamp is bounded by server receipt",
  async () => {
    const { createGenericActionLockV2 } =
      await import("../dist/core/action-lock.js");

    const values = pipeline();
    const output = guardOutputFixture();

    output.verified_at =
      new Date(Date.now() + 600000).toISOString();

    const before = Date.now();

    const guard = materializeGenericGuardOutputV2(
      output,
      values.request,
      values.evidence,
      values.worker
    );

    assert.ok(
      Date.parse(guard.verified_at) >= before
    );

    assert.ok(
      Date.parse(guard.verified_at) <= Date.now()
    );

    const lock = createGenericActionLockV2(
      values.request,
      values.evidence,
      values.worker,
      guard
    );

    assert.ok(lock.fingerprint);
    assert.ok(
      Date.parse(lock.created_at) >=
      Date.parse(guard.verified_at)
    );
  }
);

test(
  "future Worker assessment still fails closed",
  () => {
    const request = requestFixture();
    const output = workerOutputFixture();

    output.assembled_at =
      new Date(Date.now() + 120000).toISOString();

    output.assessed_at =
      new Date(Date.now() + 180000).toISOString();

    const worker = materializeGenericWorkerOutputV2(
      output,
      request
    );

    const guardOutput = guardOutputFixture();

    guardOutput.verified_at =
      new Date(Date.now() + 240000).toISOString();

    assert.throws(
      () => materializeGenericGuardOutputV2(
        guardOutput,
        request,
        worker.evidence,
        worker.assessment
      ),
      /later than trusted Guard server receipt/
    );
  }
);


test(
  "Worker and Guard future metadata permit chronological ActionLock",
  async () => {
    const { boundWorkerTimestampsAtReceiptV2 } =
      await import("../dist/api/ui/cominty-pipeline.js");

    const { createGenericActionLockV2 } =
      await import("../dist/core/action-lock.js");

    const request = requestFixture();
    const rawWorker = workerOutputFixture();

    rawWorker.assembled_at =
      new Date(Date.now() + 3600000).toISOString();

    rawWorker.assessed_at =
      new Date(Date.now() + 3660000).toISOString();

    const receipt = new Date().toISOString();

    const normalized = boundWorkerTimestampsAtReceiptV2(
      rawWorker,
      receipt
    );

    assert.equal(normalized.assembled_at, receipt);
    assert.equal(normalized.assessed_at, receipt);

    const worker = materializeGenericWorkerOutputV2(
      normalized,
      request
    );

    const rawGuard = guardOutputFixture();

    rawGuard.verified_at =
      new Date(Date.now() + 7200000).toISOString();

    const guard = materializeGenericGuardOutputV2(
      rawGuard,
      request,
      worker.evidence,
      worker.assessment
    );

    const lock = createGenericActionLockV2(
      request,
      worker.evidence,
      worker.assessment,
      guard
    );

    assert.ok(lock.fingerprint);

    assert.ok(
      Date.parse(lock.created_at) >=
      Date.parse(guard.verified_at)
    );

    assert.ok(
      Date.parse(guard.verified_at) >=
      Date.parse(worker.assessment.assessed_at)
    );
  }
);

test(
  "reversed Worker chronology remains rejected",
  async () => {
    const { boundWorkerTimestampsAtReceiptV2 } =
      await import("../dist/api/ui/cominty-pipeline.js");

    const request = requestFixture();
    const raw = workerOutputFixture();

    raw.assembled_at =
      new Date(Date.now() + 3600000).toISOString();

    raw.assessed_at =
      new Date(Date.now() + 1800000).toISOString();

    const normalized = boundWorkerTimestampsAtReceiptV2(
      raw,
      new Date().toISOString()
    );

    assert.throws(
      () => materializeGenericWorkerOutputV2(
        normalized,
        request
      ),
      /cannot be assessed before its evidence bundle/
    );
  }
);

test(
  "future evidence observations are never silently rewritten",
  async () => {
    const { boundWorkerTimestampsAtReceiptV2 } =
      await import("../dist/api/ui/cominty-pipeline.js");

    const request = requestFixture();
    const raw = workerOutputFixture();

    raw.evidence[0].source_snapshot.observed_at =
      new Date(Date.now() + 1200000).toISOString();

    raw.assembled_at =
      new Date(Date.now() + 1500000).toISOString();

    raw.assessed_at =
      new Date(Date.now() + 1560000).toISOString();

    const normalized = boundWorkerTimestampsAtReceiptV2(
      raw,
      new Date().toISOString()
    );

    assert.throws(
      () => materializeGenericWorkerOutputV2(
        normalized,
        request
      ),
      /cannot be observed after bundle assembly/
    );
  }
);

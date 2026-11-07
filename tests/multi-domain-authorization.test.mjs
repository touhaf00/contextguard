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
  GenericPreflightError
} from "../dist/core/preflight.js";

import {
  SnapshotResolverRegistryV2
} from "../dist/core/snapshot-resolver.js";

import {
  runAuthorizationLifecycleV2
} from "../dist/core/authorization-lifecycle.js";

import {
  InMemoryAuditSinkV2
} from "../dist/audit/in-memory.js";

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

const scenarios = [
  {
    name:
      "github",

    subject: {
      provider:
        "github",

      resource_type:
        "repository_ref",

      resource_id:
        "touhaf00/tp-cicd",

      selector: {
        kind:
          "tag",

        ref:
          "v1.1.0"
      }
    },

    lockedVersion:
      "b182a69150a65b60217ef9758b1fd771f64e7d1a",

    driftVersion:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

    action: {
      namespace:
        "github",

      action:
        "deploy_release",

      parameters: {
        ref:
          "v1.1.0",

        environment:
          "production"
      }
    }
  },

  {
    name:
      "stripe",

    subject: {
      provider:
        "stripe",

      resource_type:
        "payment",

      resource_id:
        "pi_123"
    },

    lockedVersion:
      "payment-state-v7",

    driftVersion:
      "payment-state-v8",

    action: {
      namespace:
        "stripe",

      action:
        "refund_payment",

      parameters: {
        amount:
          2500,

        currency:
          "eur"
      }
    }
  },

  {
    name:
      "salesforce",

    subject: {
      provider:
        "salesforce",

      resource_type:
        "opportunity",

      resource_id:
        "006xx000001ABC",

      selector: {
        organization:
          "production"
      }
    },

    lockedVersion:
      "opportunity-v12",

    driftVersion:
      "opportunity-v13",

    action: {
      namespace:
        "salesforce",

      action:
        "update_opportunity",

      parameters: {
        fields: {
          stage:
            "proposal",

          probability:
            75
        }
      }
    }
  },

  {
    name:
      "google_drive",

    subject: {
      provider:
        "google_drive",

      resource_type:
        "file",

      resource_id:
        "drive-file-123"
    },

    lockedVersion:
      "revision-17",

    driftVersion:
      "revision-18",

    action: {
      namespace:
        "google_drive",

      action:
        "delete_file",

      parameters: {
        permanent:
          false
      }
    }
  }
];

function buildPipeline(
  scenario
) {
  const request = {
    request_id:
      `req-${scenario.name}`,

    subject:
      clone(
        scenario.subject
      ),

    snapshot: {
      snapshot_id:
        `${scenario.name}-locked-snapshot`,

      subject:
        clone(
          scenario.subject
        ),

      version:
        scenario.lockedVersion,

      observed_at:
        "2026-11-01T22:00:00Z",

      metadata: {
        domain:
          scenario.name
      }
    },

    proposed_action:
      clone(
        scenario.action
      ),

    policy: {
      policy_id:
        `${scenario.name}-safety`,

      version:
        "1.0.0",

      name:
        `${scenario.name} safety policy`,

      objective:
        "Verify the exact resource state and exact proposed action before execution.",

      decision_rules: [
        "The required resource state must be independently supported."
      ],

      human_approval:
        "REQUIRED",

      preflight_required:
        true
    },

    runtime: {
      platform:
        "cominty",

      worker_agent_id:
        "worker-generic",

      guard_agent_id:
        "guard-generic",

      tool_scope: [
        `${scenario.subject.provider}.read`
      ]
    },

    requested_at:
      "2026-11-01T22:01:00Z"
  };

  const evidence = {
    protocol_version:
      "2",

    request_digest:
      authorizationRequestDigest(
        request
      ),

    assembled_at:
      "2026-11-01T22:02:00Z",

    evidence: [
      {
        evidence_id:
          "E1",

        source_snapshot: {
          snapshot_id:
            `${scenario.name}-evidence-snapshot`,

          subject:
            clone(
              scenario.subject
            ),

          version:
            scenario.lockedVersion,

          observed_at:
            "2026-11-01T22:01:30Z",

          metadata: {
            domain:
              scenario.name
          }
        },

        locator:
          `${scenario.name}.resource.state`,

        observation:
          "The required resource state was observed and supports the proposed authorization.",

        level:
          "OUTPUT_OBSERVED"
      }
    ],

    claims: [
      {
        claim_id:
          "C1",

        statement:
          "The resource state required by policy is satisfied.",

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
      0.92,

    summary:
      "Required state is supported by the collected evidence.",

    assessed_at:
      "2026-11-01T22:03:00Z"
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
      "ContextGuard independently supports the READY assessment.",

    verified_at:
      "2026-11-01T22:04:00Z"
  };

  return {
    request,
    evidence,
    worker,
    guard
  };
}

function createRegistry(
  scenario,
  currentVersion
) {
  const registry =
    new SnapshotResolverRegistryV2();

  registry.register({
    resolver_version:
      "2",

    resolver_id:
      `${scenario.name}.test`,

    provider:
      scenario.subject
        .provider,

    supports(subject) {
      return (
        subject.provider ===
          scenario.subject
            .provider &&
        subject.resource_type ===
          scenario.subject
            .resource_type
      );
    },

    async resolve(subject) {
      return {
        snapshot_id:
          `${scenario.name}-fresh-snapshot`,

        subject:
          clone(subject),

        version:
          currentVersion,

        observed_at:
          "2026-11-01T22:07:30Z",

        metadata: {
          domain:
            scenario.name,

          source:
            "preflight-resolution"
        }
      };
    }
  });

  return registry;
}

function createApprovalProvider(
  scenario
) {
  return {
    provider_version:
      "2",

    provider_id:
      `test.${scenario.name}.approval`,

    async requestDecision(
      challenge
    ) {
      return {
        decision_version:
          "2",

        provider_id:
          `test.${scenario.name}.approval`,

        lock_id:
          challenge.lock_id,

        lock_fingerprint:
          challenge
            .lock_fingerprint,

        principal: {
          principal_type:
            "HUMAN",

          principal_id:
            "security-operator",

          display_name:
            "Security Operator",

          authentication_method:
            "authenticated-test-session"
        },

        decision:
          "APPROVED",

        decided_at:
          "2026-11-01T22:07:00Z"
      };
    }
  };
}

function currentContext(
  pipeline
) {
  return {
    proposed_action:
      clone(
        pipeline.request
          .proposed_action
      ),

    policy:
      clone(
        pipeline.request
          .policy
      ),

    runtime:
      clone(
        pipeline.request
          .runtime
      )
  };
}

function lifecycleOptions(
  scenario
) {
  return {
    intentId:
      `intent-${scenario.name}`,

    lockId:
      `lock-${scenario.name}`,

    lockCreatedAt:
      "2026-11-01T22:05:00Z",

    approvalRequestedAt:
      "2026-11-01T22:06:00Z",

    approvalId:
      `approval-${scenario.name}`,

    approvalTtlMs:
      10 * 60 * 1000,

    preflightCheckedAt:
      "2026-11-01T22:08:00Z"
  };
}

for (
  const scenario
  of scenarios
) {
  test(
    `${scenario.name}: same generic lifecycle authorizes the exact unchanged resource for executor`,
    async () => {
      const pipeline =
        buildPipeline(
          scenario
        );

      const audit =
        new InMemoryAuditSinkV2({
          sinkId:
            `audit.${scenario.name}`
        });

      const result =
        await runAuthorizationLifecycleV2({
          request:
            pipeline.request,

          evidence:
            pipeline.evidence,

          worker_assessment:
            pipeline.worker,

          guard_verification:
            pipeline.guard,

          current_context:
            currentContext(
              pipeline
            ),

          resolver_registry:
            createRegistry(
              scenario,
              scenario.lockedVersion
            ),

          approval_provider:
            createApprovalProvider(
              scenario
            ),

          audit_sink:
            audit,

          options:
            lifecycleOptions(
              scenario
            )
        });

      assert.equal(
        result.status,
        "AUTHORIZED_FOR_EXECUTOR"
      );

      assert.equal(
        result.decision.status,
        "AWAITING_HUMAN_APPROVAL"
      );

      assert.equal(
        result.approval.decision,
        "APPROVED"
      );

      assert.equal(
        result.preflight.status,
        "PRE_EXECUTION_VERIFIED"
      );

      assert.equal(
        result.preflight
          .observed_snapshot_version,
        scenario.lockedVersion
      );

      assert.deepEqual(
        result.lock
          .intent
          .request
          .subject,
        scenario.subject
      );

      assert.deepEqual(
        result.lock
          .intent
          .request
          .proposed_action,
        scenario.action
      );

      assert.equal(
        result.execution_configured,
        false
      );

      assert.equal(
        result.external_action_executed,
        false
      );

      assert.equal(
        audit.verify(),
        true
      );

      const events =
        await audit.readAll();

      assert.deepEqual(
        events.map(
          (event) =>
            event.event_type
        ),
        [
          "authorization.decision",
          "action.locked",
          "approval.decided",
          "preflight.verified",
          "authorization.ready_for_executor"
        ]
      );
    }
  );

  test(
    `${scenario.name}: resource state drift after approval is blocked fail-closed`,
    async () => {
      const pipeline =
        buildPipeline(
          scenario
        );

      const audit =
        new InMemoryAuditSinkV2({
          sinkId:
            `audit.${scenario.name}.drift`
        });

      await assert.rejects(
        runAuthorizationLifecycleV2({
          request:
            pipeline.request,

          evidence:
            pipeline.evidence,

          worker_assessment:
            pipeline.worker,

          guard_verification:
            pipeline.guard,

          current_context:
            currentContext(
              pipeline
            ),

          resolver_registry:
            createRegistry(
              scenario,
              scenario.driftVersion
            ),

          approval_provider:
            createApprovalProvider(
              scenario
            ),

          audit_sink:
            audit,

          options:
            lifecycleOptions(
              scenario
            )
        }),
        (error) =>
          error instanceof
            GenericPreflightError &&
          error.code ===
            "SNAPSHOT_CHANGED"
      );

      assert.equal(
        audit.verify(),
        true
      );

      const events =
        await audit.readAll();

      assert.equal(
        events.at(-1)
          .event_type,
        "preflight.failed"
      );

      assert.equal(
        events.some(
          (event) =>
            event.event_type ===
            "authorization.ready_for_executor"
        ),
        false
      );

      assert.equal(
        events.some(
          (event) =>
            event.payload
              .external_action_executed ===
            true
        ),
        false
      );
    }
  );
}

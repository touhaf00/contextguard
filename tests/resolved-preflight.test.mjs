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
  GenericPreflightError
} from "../dist/core/preflight.js";

import {
  SnapshotResolverError,
  SnapshotResolverRegistryV2
} from "../dist/core/snapshot-resolver.js";

import {
  performResolvedGenericPreflightV2
} from "../dist/core/resolved-preflight.js";

import {
  createGitHubSnapshotResolverV2
} from "../dist/adapters/github/snapshot-resolver.js";

const SHA_A =
  "a".repeat(40);

const SHA_B =
  "b".repeat(40);

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

function defaultSubject() {
  return {
    provider: "test",

    resource_type:
      "payment",

    resource_id:
      "payment-123"
  };
}

function buildPipeline({
  subject =
    defaultSubject(),

  snapshotVersion =
    "state-v7"
} = {}) {
  const request = {
    request_id:
      "req-resolved-preflight",

    subject:
      clone(subject),

    snapshot: {
      snapshot_id:
        "locked-snapshot",

      subject:
        clone(subject),

      version:
        snapshotVersion,

      observed_at:
        "2026-11-01T19:00:00Z"
    },

    proposed_action: {
      namespace:
        subject.provider,

      action:
        "perform_action",

      parameters: {
        amount: 2500
      }
    },

    policy: {
      policy_id:
        "safety-policy",

      version:
        "1.0.0",

      name:
        "Safety policy",

      objective:
        "Verify the action before execution.",

      decision_rules: [
        "Required state must be verified."
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
        "worker-1",

      guard_agent_id:
        "guard-1",

      tool_scope: [
        `${subject.provider}.read`
      ]
    },

    requested_at:
      "2026-11-01T19:01:00Z"
  };

  const evidence = {
    protocol_version:
      "2",

    request_digest:
      authorizationRequestDigest(
        request
      ),

    assembled_at:
      "2026-11-01T19:02:00Z",

    evidence: [
      {
        evidence_id:
          "E1",

        source_snapshot: {
          snapshot_id:
            "evidence-snapshot",

          subject:
            clone(subject),

          version:
            snapshotVersion,

          observed_at:
            "2026-11-01T19:01:30Z"
        },

        locator:
          "provider.resource",

        observation:
          "Required state was observed.",

        level:
          "OUTPUT_OBSERVED"
      }
    ],

    claims: [
      {
        claim_id:
          "C1",

        statement:
          "Required state is verified.",

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
      0.9,

    summary:
      "Required state is supported.",

    assessed_at:
      "2026-11-01T19:03:00Z"
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

    verified_claims:
      ["C1"],

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
      "Worker decision is independently supported.",

    verified_at:
      "2026-11-01T19:04:00Z"
  };

  const lock =
    createGenericActionLockV2(
      request,
      evidence,
      worker,
      guard,
      {
        intentId:
          "intent-resolved-preflight",

        lockId:
          "lock-resolved-preflight",

        createdAt:
          "2026-11-01T19:05:00Z"
      }
    );

  const approval =
    createApprovalAttestationV2(
      lock,
      {
        principal_type:
          "HUMAN",

        principal_id:
          "operator-123",

        authentication_method:
          "authenticated-session"
      },
      "APPROVED",
      {
        approvalId:
          "approval-resolved-preflight",

        decidedAt:
          "2026-11-01T19:06:00Z",

        ttlMs:
          10 * 60 * 1000
      }
    );

  return {
    request,
    evidence,
    worker,
    guard,
    lock,
    approval
  };
}

function currentContext(
  values
) {
  return {
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

function registryReturning(
  subject,
  version,
  {
    observedAt =
      "2026-11-01T19:07:00Z",

    onResolve
  } = {}
) {
  const registry =
    new SnapshotResolverRegistryV2();

  registry.register({
    resolver_version:
      "2",

    resolver_id:
      `${subject.provider}.test`,

    provider:
      subject.provider,

    supports(candidate) {
      return (
        candidate.resource_type ===
          subject.resource_type
      );
    },

    async resolve(candidate) {
      if (onResolve) {
        onResolve(candidate);
      }

      return {
        snapshot_id:
          "fresh-snapshot",

        subject:
          clone(candidate),

        version,

        observed_at:
          observedAt
      };
    }
  });

  return registry;
}

function expectPreflightCode(
  promise,
  code
) {
  return assert.rejects(
    promise,
    (error) =>
      error instanceof
        GenericPreflightError &&
      error.code === code
  );
}

test(
  "re-resolves the exact locked subject immediately before preflight",
  async () => {
    const values =
      buildPipeline();

    let observedSubject;

    const registry =
      registryReturning(
        values.request.subject,
        "state-v7",
        {
          onResolve(subject) {
            observedSubject =
              subject;
          }
        }
      );

    const result =
      await performResolvedGenericPreflightV2(
        registry,
        values.lock,
        values.approval,
        currentContext(values),
        {
          checkedAt:
            "2026-11-01T19:08:00Z"
        }
      );

    assert.deepEqual(
      observedSubject,
      values.request.subject
    );

    assert.equal(
      result.status,
      "PRE_EXECUTION_VERIFIED"
    );
  }
);

test(
  "fresh resource version drift blocks execution",
  async () => {
    const values =
      buildPipeline();

    const registry =
      registryReturning(
        values.request.subject,
        "state-v8"
      );

    await expectPreflightCode(
      performResolvedGenericPreflightV2(
        registry,
        values.lock,
        values.approval,
        currentContext(values),
        {
          checkedAt:
            "2026-11-01T19:08:00Z"
        }
      ),
      "SNAPSHOT_CHANGED"
    );
  }
);

test(
  "resolver failure blocks preflight",
  async () => {
    const values =
      buildPipeline();

    const registry =
      new SnapshotResolverRegistryV2();

    registry.register({
      resolver_version:
        "2",

      resolver_id:
        "test.failure",

      provider:
        "test",

      supports() {
        return true;
      },

      async resolve() {
        throw new Error(
          "provider unavailable"
        );
      }
    });

    await assert.rejects(
      performResolvedGenericPreflightV2(
        registry,
        values.lock,
        values.approval,
        currentContext(values),
        {
          checkedAt:
            "2026-11-01T19:08:00Z"
        }
      ),
      (error) =>
        error instanceof
          SnapshotResolverError &&
        error.code ===
          "RESOLUTION_FAILED"
    );
  }
);

test(
  "tampered ActionLock is rejected before any resolver call",
  async () => {
    const values =
      buildPipeline();

    let calls = 0;

    const registry =
      registryReturning(
        values.request.subject,
        "state-v7",
        {
          onResolve() {
            calls += 1;
          }
        }
      );

    values.lock.intent
      .request
      .proposed_action
      .parameters.amount =
      9999;

    await expectPreflightCode(
      performResolvedGenericPreflightV2(
        registry,
        values.lock,
        values.approval,
        currentContext(values),
        {
          checkedAt:
            "2026-11-01T19:08:00Z"
        }
      ),
      "INVALID_LOCK"
    );

    assert.equal(
      calls,
      0
    );
  }
);

test(
  "resolved preflight still requires mandatory human approval",
  async () => {
    const values =
      buildPipeline();

    const registry =
      registryReturning(
        values.request.subject,
        "state-v7"
      );

    await expectPreflightCode(
      performResolvedGenericPreflightV2(
        registry,
        values.lock,
        undefined,
        currentContext(values),
        {
          checkedAt:
            "2026-11-01T19:08:00Z"
        }
      ),
      "APPROVAL_REQUIRED"
    );
  }
);

test(
  "current proposed action drift is blocked after re-resolution",
  async () => {
    const values =
      buildPipeline();

    const context =
      currentContext(values);

    context.proposed_action
      .parameters.amount =
      5000;

    await expectPreflightCode(
      performResolvedGenericPreflightV2(
        registryReturning(
          values.request.subject,
          "state-v7"
        ),
        values.lock,
        values.approval,
        context,
        {
          checkedAt:
            "2026-11-01T19:08:00Z"
        }
      ),
      "ACTION_CHANGED"
    );
  }
);

test(
  "current policy drift is blocked after re-resolution",
  async () => {
    const values =
      buildPipeline();

    const context =
      currentContext(values);

    context.policy.version =
      "2.0.0";

    await expectPreflightCode(
      performResolvedGenericPreflightV2(
        registryReturning(
          values.request.subject,
          "state-v7"
        ),
        values.lock,
        values.approval,
        context,
        {
          checkedAt:
            "2026-11-01T19:08:00Z"
        }
      ),
      "POLICY_CHANGED"
    );
  }
);

test(
  "current runtime drift is blocked after re-resolution",
  async () => {
    const values =
      buildPipeline();

    const context =
      currentContext(values);

    context.runtime
      .guard_agent_id =
      "guard-other";

    await expectPreflightCode(
      performResolvedGenericPreflightV2(
        registryReturning(
          values.request.subject,
          "state-v7"
        ),
        values.lock,
        values.approval,
        context,
        {
          checkedAt:
            "2026-11-01T19:08:00Z"
        }
      ),
      "RUNTIME_CHANGED"
    );
  }
);

test(
  "provider observation must be fresh after human approval",
  async () => {
    const values =
      buildPipeline();

    const registry =
      registryReturning(
        values.request.subject,
        "state-v7",
        {
          observedAt:
            "2026-11-01T19:05:30Z"
        }
      );

    await expectPreflightCode(
      performResolvedGenericPreflightV2(
        registry,
        values.lock,
        values.approval,
        currentContext(values),
        {
          checkedAt:
            "2026-11-01T19:08:00Z"
        }
      ),
      "SNAPSHOT_NOT_FRESH"
    );
  }
);

test(
  "moving GitHub branch from locked SHA A to SHA B is blocked",
  async () => {
    const githubSubject = {
      provider:
        "github",

      resource_type:
        "repository_ref",

      resource_id:
        "touhaf00/tp-cicd",

      selector: {
        kind:
          "branch",

        ref:
          "main"
      }
    };

    const values =
      buildPipeline({
        subject:
          githubSubject,

        snapshotVersion:
          SHA_A
      });

    const githubClient = {
      async getRepository() {
        return {
          default_branch:
            "main"
        };
      },

      async getCommit() {
        return {
          sha:
            SHA_B
        };
      },

      async getRef(
        repository,
        namespace,
        reference
      ) {
        assert.equal(
          repository,
          "touhaf00/tp-cicd"
        );

        assert.equal(
          namespace,
          "heads"
        );

        assert.equal(
          reference,
          "main"
        );

        return {
          object: {
            type:
              "commit",

            sha:
              SHA_B
          }
        };
      },

      async getGitTag() {
        throw new Error(
          "not expected"
        );
      }
    };

    const registry =
      new SnapshotResolverRegistryV2();

    registry.register(
      createGitHubSnapshotResolverV2(
        githubClient,
        {
          now: () =>
            new Date(
              "2026-11-01T19:07:00Z"
            )
        }
      )
    );

    await expectPreflightCode(
      performResolvedGenericPreflightV2(
        registry,
        values.lock,
        values.approval,
        currentContext(values),
        {
          checkedAt:
            "2026-11-01T19:08:00Z"
        }
      ),
      "SNAPSHOT_CHANGED"
    );
  }
);

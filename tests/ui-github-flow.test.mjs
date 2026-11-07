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
  GenericAuthorizationServiceV2
} from "../dist/api/v2/service.js";

import {
  TrustedExecutionContextStoreV2
} from "../dist/api/v2/execution-context-store.js";

import {
  GitHubUiFlowErrorV2,
  GitHubUiFlowV2
} from "../dist/api/ui/github-flow.js";

function resolver() {
  return {
    resolver_version:
      "2",

    resolver_id:
      "github.ui-test",

    provider:
      "github",

    supports(subject) {
      return (
        subject.provider ===
          "github" &&
        subject.resource_type ===
          "repository_ref"
      );
    },

    async resolve(subject) {
      return {
        snapshot_id:
          "github:touhaf00/contextguard@" +
          "1".repeat(40),

        subject,

        version:
          "1".repeat(40),

        observed_at:
          "2026-11-02T04:00:00.000Z"
      };
    }
  };
}

function pipeline() {
  return {
    runtimeIdentity() {
      return {
        platform:
          "cominty",

        worker_agent_id:
          "worker-ui-test",

        guard_agent_id:
          "guard-ui-test",

        tool_scope: [
          "github.read"
        ]
      };
    },

    async run(request) {
      const evidence = {
        protocol_version:
          "2",

        request_digest:
          authorizationRequestDigest(
            request
          ),

        assembled_at:
          "2026-11-02T04:01:00.000Z",

        evidence: [
          {
            evidence_id:
              "E1",

            source_snapshot:
              request.snapshot,

            locator:
              "github://touhaf00/contextguard/refs/heads/main",

            observation:
              "The exact target state was independently observed.",

            level:
              "OUTPUT_OBSERVED"
          }
        ],

        claims: [
          {
            claim_id:
              "C1",

            statement:
              "The exact GitHub target state is identified.",

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
          0.99,

        summary:
          "Exact GitHub target and action are ready for authorization.",

        assessed_at:
          "2026-11-02T04:02:00.000Z"
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
          "The READY decision is independently supported.",

        verified_at:
          "2026-11-02T04:03:00.000Z"
      };

      return {
        evidence,

        worker_assessment:
          worker,

        guard_verification:
          guard
      };
    }
  };
}

function flow() {
  return new GitHubUiFlowV2({
    authorizationService:
      new GenericAuthorizationServiceV2(),

    executionContextStore:
      new TrustedExecutionContextStoreV2(),

    snapshotResolver:
      resolver(),

    agentPipeline:
      pipeline(),

    executionConfigured:
      true,

    now:
      () =>
        new Date(
          "2026-11-02T04:00:30.000Z"
        ),

    requestId:
      () =>
        "ui-request-1"
  });
}

function body() {
  return {
    repository:
      "touhaf00/contextguard",

    target: {
      kind:
        "branch",

      ref:
        "main"
    },

    issue: {
      title:
        "Controlled UI execution",

      body:
        "Created only after ContextGuard authorization."
    }
  };
}

test(
  "UI flow creates server-side V2 authorization from minimal browser input",
  async () => {
    const result =
      await flow().start(
        body()
      );

    assert.equal(
      result.stage,
      "AWAITING_HUMAN_APPROVAL"
    );

    assert.equal(
      result.authorization
        .next_step,
      "COLLECT_HUMAN_APPROVAL"
    );

    assert.equal(
      result.request
        .subject
        .provider,
      "github"
    );

    assert.equal(
      result.request
        .snapshot
        .version,
      "1".repeat(40)
    );

    assert.equal(
      result.request
        .proposed_action
        .action,
      "create_issue"
    );

    assert.equal(
      result.execution_configured,
      true
    );

    assert.equal(
      result.external_action_executed,
      false
    );
  }
);

test(
  "browser cannot supply authoritative snapshot or Guard verdict",
  async () => {
    await assert.rejects(
      flow().start({
        ...body(),

        snapshot: {
          version:
            "9".repeat(40)
        }
      }),
      error =>
        error instanceof
          GitHubUiFlowErrorV2 &&
        error.code ===
          "UNSUPPORTED_FIELD"
    );
  }
);

test(
  "UI execution flow refuses unsupported GitHub target kinds",
  async () => {
    await assert.rejects(
      flow().start({
        ...body(),

        target: {
          kind:
            "release",

          ref:
            "v1.0.0"
        }
      }),
      error =>
        error instanceof
          GitHubUiFlowErrorV2 &&
        error.code ===
          "INVALID_TARGET"
    );
  }
);

test(
  "UI execution flow binds exact issue title and body into ActionLock",
  async () => {
    const result =
      await flow().start(
        body()
      );

    const lockedAction =
      result.authorization
        .lock
        .intent
        .request
        .proposed_action;

    assert.deepEqual(
      lockedAction,
      {
        namespace:
          "github",

        action:
          "create_issue",

        parameters: {
          title:
            "Controlled UI execution",

          body:
            "Created only after ContextGuard authorization."
        }
      }
    );
  }
);

test(
  "UI flow rejects an empty issue body before authorization",
  async () => {
    await assert.rejects(
      flow().start({
        ...body(),

        issue: {
          title:
            "Controlled UI execution",

          body:
            ""
        }
      }),
      error =>
        error instanceof
          GitHubUiFlowErrorV2 &&
        error.code ===
          "INVALID_BODY"
    );
  }
);

test(
  "UI flow enforces the trusted executor issue body limit",
  async () => {
    await assert.rejects(
      flow().start({
        ...body(),

        issue: {
          title:
            "Controlled UI execution",

          body:
            "x".repeat(10_001)
        }
      }),
      error =>
        error instanceof
          GitHubUiFlowErrorV2 &&
        error.code ===
          "INVALID_ISSUE"
    );
  }
);

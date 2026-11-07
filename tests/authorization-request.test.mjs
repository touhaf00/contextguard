import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalJson,
  validateAuthorizationRequest,
  validateRuntimeIdentity
} from "../dist/core/contracts.js";

function baseRequest() {
  return {
    request_id:
      "req-001",

    subject: {
      provider: "github",
      resource_type:
        "repository_target",
      resource_id:
        "touhaf00/tp-cicd",

      selector: {
        type: "tag",
        reference: "v1.1.0"
      }
    },

    snapshot: {
      snapshot_id:
        "snapshot-001",

      subject: {
        provider: "github",
        resource_type:
          "repository_target",
        resource_id:
          "touhaf00/tp-cicd",

        selector: {
          reference: "v1.1.0",
          type: "tag"
        }
      },

      version:
        "b182a69150a65b60217ef9758b1fd771f64e7d1a",

      observed_at:
        "2026-11-01T00:00:00Z"
    },

    proposed_action: {
      namespace: "github",
      action:
        "proceed_to_next_stage",

      parameters: {
        environment:
          "production"
      }
    },

    policy: {
      policy_id:
        "release-safety",

      version:
        "1.0.0",

      name:
        "Release safety",

      objective:
        "Authorize only sufficiently verified release progression.",

      decision_rules: [
        "Decision-critical evidence must be verified."
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

      worker_profile_version:
        "worker-v1",

      guard_profile_version:
        "guard-v1",

      tool_scope: [
        "github.read",
        "github.actions.read"
      ]
    },

    requested_at:
      "2026-11-01T00:01:00Z"
  };
}

test(
  "accepts a complete generic authorization request",
  () => {
    const request =
      validateAuthorizationRequest(
        baseRequest()
      );

    assert.equal(
      request.runtime.platform,
      "cominty"
    );

    assert.equal(
      request.proposed_action
        .action,
      "proceed_to_next_stage"
    );

    assert.equal(
      request.snapshot.version,
      "b182a69150a65b60217ef9758b1fd771f64e7d1a"
    );
  }
);

test(
  "accepts a payment authorization request",
  () => {
    const request =
      baseRequest();

    request.subject = {
      provider: "stripe",
      resource_type:
        "payment",
      resource_id:
        "pi_123"
    };

    request.snapshot = {
      snapshot_id:
        "payment-snapshot-7",

      subject:
        request.subject,

      version:
        "state-v7",

      observed_at:
        "2026-11-01T00:02:00Z"
    };

    request.proposed_action = {
      namespace: "stripe",
      action:
        "refund_payment",

      parameters: {
        amount: 2500,
        currency: "EUR"
      }
    };

    const validated =
      validateAuthorizationRequest(
        request
      );

    assert.equal(
      validated.subject.provider,
      "stripe"
    );
  }
);

test(
  "rejects a snapshot belonging to another subject",
  () => {
    const request =
      baseRequest();

    request.snapshot.subject =
      {
        ...request.snapshot
          .subject,

        resource_id:
          "different/repository"
      };

    assert.throws(
      () =>
        validateAuthorizationRequest(
          request
        ),
      /snapshot must belong/
    );
  }
);

test(
  "normalizes runtime tool scope ordering",
  () => {
    const runtime =
      validateRuntimeIdentity({
        platform: "cominty",

        worker_agent_id: "w",
        guard_agent_id: "g",

        tool_scope: [
          "stripe.write",
          "stripe.read",
          "audit.read"
        ]
      });

    assert.deepEqual(
      runtime.tool_scope,
      [
        "audit.read",
        "stripe.read",
        "stripe.write"
      ]
    );
  }
);

test(
  "rejects duplicate runtime tool scopes",
  () => {
    assert.throws(
      () =>
        validateRuntimeIdentity({
          platform:
            "cominty",

          worker_agent_id:
            "w",

          guard_agent_id:
            "g",

          tool_scope: [
            "github.read",
            "github.read"
          ]
        }),
      /must not contain duplicates/
    );
  }
);

test(
  "rejects invalid authorization request timestamp",
  () => {
    const request =
      baseRequest();

    request.requested_at =
      "tomorrow-ish";

    assert.throws(
      () =>
        validateAuthorizationRequest(
          request
        ),
      /valid timestamp/
    );
  }
);

test(
  "runtime identity changes canonical request identity",
  () => {
    const first =
      validateAuthorizationRequest(
        baseRequest()
      );

    const modified =
      baseRequest();

    modified.runtime
      .guard_agent_id =
      "guard-002";

    const second =
      validateAuthorizationRequest(
        modified
      );

    assert.notEqual(
      canonicalJson(first),
      canonicalJson(second)
    );
  }
);

test(
  "policy version changes canonical request identity",
  () => {
    const first =
      validateAuthorizationRequest(
        baseRequest()
      );

    const modified =
      baseRequest();

    modified.policy.version =
      "2.0.0";

    const second =
      validateAuthorizationRequest(
        modified
      );

    assert.notEqual(
      canonicalJson(first),
      canonicalJson(second)
    );
  }
);

test(
  "action parameter changes canonical request identity",
  () => {
    const first =
      validateAuthorizationRequest(
        baseRequest()
      );

    const modified =
      baseRequest();

    modified.proposed_action
      .parameters.environment =
      "staging";

    const second =
      validateAuthorizationRequest(
        modified
      );

    assert.notEqual(
      canonicalJson(first),
      canonicalJson(second)
    );
  }
);

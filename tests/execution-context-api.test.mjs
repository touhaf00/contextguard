import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTrustedExecutionContextApiV2,
  TrustedExecutionContextApiErrorV2
} from "../dist/api/v2/execution-context.js";

function currentContext() {
  return {
    proposed_action: {
      namespace:
        "github",

      action:
        "deploy_release",

      parameters: {
        environment:
          "production"
      }
    },

    policy: {
      policy_id:
        "github-release",

      version:
        "1.0.0",

      name:
        "GitHub release policy",

      objective:
        "Verify release authorization.",

      decision_rules: [
        "Target state must remain unchanged."
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
        "github.read"
      ]
    }
  };
}

function sessionStore() {
  return {
    get(
      sessionId
    ) {
      assert.equal(
        sessionId,
        "session-1"
      );

      return {
        session_id:
          "session-1",

        request_id:
          "request-1",

        lock_fingerprint:
          "a".repeat(64)
      };
    }
  };
}

function contextStore() {
  const calls = [];

  return {
    calls,

    set(
      sessionId,
      fingerprint,
      context
    ) {
      calls.push({
        sessionId,
        fingerprint,
        context
      });
    }
  };
}

test(
  "trusted execution context API binds context to server-side session fingerprint",
  () => {
    const contexts =
      contextStore();

    const context =
      currentContext();

    const result =
      applyTrustedExecutionContextApiV2(
        {
          session_id:
            "session-1",

          ...context
        },
        sessionStore(),
        contexts
      );

    assert.equal(
      result.status,
      "TRUSTED_EXECUTION_CONTEXT_UPDATED"
    );

    assert.equal(
      contexts.calls.length,
      1
    );

    assert.equal(
      contexts.calls[0]
        .fingerprint,
      "a".repeat(64)
    );

    assert.equal(
      contexts.calls[0]
        .context
        .proposed_action
        .action,
      "deploy_release"
    );

    assert.equal(
      result.external_action_executed,
      false
    );
  }
);

test(
  "caller cannot inject an authoritative lock fingerprint",
  () => {
    assert.throws(
      () =>
        applyTrustedExecutionContextApiV2(
          {
            session_id:
              "session-1",

            lock_fingerprint:
              "b".repeat(64),

            ...currentContext()
          },
          sessionStore(),
          contextStore()
        ),
      (error) =>
        error instanceof
          TrustedExecutionContextApiErrorV2 &&
        error.code ===
          "UNSUPPORTED_FIELD"
    );
  }
);

test(
  "caller cannot inject a snapshot through execution context API",
  () => {
    assert.throws(
      () =>
        applyTrustedExecutionContextApiV2(
          {
            session_id:
              "session-1",

            snapshot: {
              version:
                "attacker-state"
            },

            ...currentContext()
          },
          sessionStore(),
          contextStore()
        ),
      (error) =>
        error instanceof
          TrustedExecutionContextApiErrorV2 &&
        error.code ===
          "UNSUPPORTED_FIELD"
    );
  }
);

test(
  "execution context requires all current action policy and runtime fields",
  () => {
    const context =
      currentContext();

    assert.throws(
      () =>
        applyTrustedExecutionContextApiV2(
          {
            session_id:
              "session-1",

            proposed_action:
              context.proposed_action,

            policy:
              context.policy
          },
          sessionStore(),
          contextStore()
        ),
      (error) =>
        error instanceof
          TrustedExecutionContextApiErrorV2 &&
        error.code ===
          "INVALID_BODY"
    );
  }
);

test(
  "execution context API does not configure or perform external execution",
  () => {
    const result =
      applyTrustedExecutionContextApiV2(
        {
          session_id:
            "session-1",

          ...currentContext()
        },
        sessionStore(),
        contextStore()
      );

    assert.equal(
      result.execution_configured,
      false
    );

    assert.equal(
      result.external_action_executed,
      false
    );
  }
);

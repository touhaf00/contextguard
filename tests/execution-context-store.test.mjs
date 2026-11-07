import assert from "node:assert/strict";
import test from "node:test";

import {
  TrustedExecutionContextStoreErrorV2,
  TrustedExecutionContextStoreV2
} from "../dist/api/v2/execution-context-store.js";

const FINGERPRINT =
  "a".repeat(64);

const OTHER_FINGERPRINT =
  "b".repeat(64);

function context(
  action =
    "deploy_release"
) {
  return {
    proposed_action: {
      namespace:
        "github",

      action,

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

function session(
  fingerprint =
    FINGERPRINT
) {
  return {
    session_id:
      "session-1",

    lock_fingerprint:
      fingerprint
  };
}

test(
  "stores trusted execution context independently from the ActionLock",
  async () => {
    const store =
      new TrustedExecutionContextStoreV2();

    store.set(
      "session-1",
      FINGERPRINT,
      context()
    );

    const result =
      await store.getCurrentContext(
        session()
      );

    assert.equal(
      result.proposed_action.action,
      "deploy_release"
    );
  }
);

test(
  "returned execution context is detached from internal state",
  async () => {
    const store =
      new TrustedExecutionContextStoreV2();

    store.set(
      "session-1",
      FINGERPRINT,
      context()
    );

    const first =
      await store.getCurrentContext(
        session()
      );

    first.proposed_action.action =
      "tampered";

    const second =
      await store.getCurrentContext(
        session()
      );

    assert.equal(
      second.proposed_action.action,
      "deploy_release"
    );
  }
);

test(
  "trusted runtime may update current execution context before preflight",
  async () => {
    const store =
      new TrustedExecutionContextStoreV2();

    store.set(
      "session-1",
      FINGERPRINT,
      context()
    );

    store.set(
      "session-1",
      FINGERPRINT,
      context(
        "delete_repository"
      )
    );

    const result =
      await store.getCurrentContext(
        session()
      );

    assert.equal(
      result.proposed_action.action,
      "delete_repository"
    );
  }
);

test(
  "missing trusted execution context fails closed",
  async () => {
    const store =
      new TrustedExecutionContextStoreV2();

    await assert.rejects(
      store.getCurrentContext(
        session()
      ),
      (error) =>
        error instanceof
          TrustedExecutionContextStoreErrorV2 &&
        error.code ===
          "MISSING_CONTEXT"
    );
  }
);

test(
  "execution context cannot be replayed against another lock fingerprint",
  async () => {
    const store =
      new TrustedExecutionContextStoreV2();

    store.set(
      "session-1",
      FINGERPRINT,
      context()
    );

    await assert.rejects(
      store.getCurrentContext(
        session(
          OTHER_FINGERPRINT
        )
      ),
      (error) =>
        error instanceof
          TrustedExecutionContextStoreErrorV2 &&
        error.code ===
          "LOCK_MISMATCH"
    );
  }
);

test(
  "invalid trusted execution context is rejected before storage",
  () => {
    const store =
      new TrustedExecutionContextStoreV2();

    assert.throws(
      () =>
        store.set(
          "session-1",
          FINGERPRINT,
          {
            proposed_action: {
              action:
                "deploy_release"
            }
          }
        ),
      (error) =>
        error instanceof
          TrustedExecutionContextStoreErrorV2 &&
        error.code ===
          "INVALID_CONTEXT"
    );

    assert.equal(
      store.has(
        "session-1"
      ),
      false
    );
  }
);

import assert from "node:assert/strict";
import test from "node:test";

import {
  createGitHubAuthorizationPresetV2
} from "../dist/adapters/github/preset.js";

import {
  GitHubRestSnapshotClientV2
} from "../dist/adapters/github/rest-client.js";

import {
  TrustedExecutionContextStoreV2
} from "../dist/api/v2/execution-context-store.js";

import {
  AuthorizationSessionStoreErrorV2
} from "../dist/api/v2/session-store.js";

test(
  "GitHub preset creates REST client context store and authorization service",
  () => {
    const preset =
      createGitHubAuthorizationPresetV2({
        apiBaseUrl:
          "https://api.github.test"
      });

    assert.ok(
      preset.client instanceof
        GitHubRestSnapshotClientV2
    );

    assert.ok(
      preset.contextStore instanceof
        TrustedExecutionContextStoreV2
    );

    assert.ok(
      preset.service.sessions
    );

    assert.ok(
      preset.service.approvals
    );
  }
);

test(
  "GitHub preset does not require a token for public read-only repositories",
  () => {
    assert.doesNotThrow(
      () =>
        createGitHubAuthorizationPresetV2({
          apiBaseUrl:
            "https://api.github.test"
        })
    );
  }
);

test(
  "GitHub preset keeps server-side token encapsulated",
  () => {
    const preset =
      createGitHubAuthorizationPresetV2({
        token:
          "github-secret",

        apiBaseUrl:
          "https://api.github.test"
      });

    assert.equal(
      "token" in preset.client,
      false
    );

    assert.equal(
      "token" in preset.service,
      false
    );
  }
);

test(
  "GitHub preset preserves custom session-store safety limits",
  () => {
    const preset =
      createGitHubAuthorizationPresetV2({
        apiBaseUrl:
          "https://api.github.test",

        sessionStoreOptions: {
          capacity:
            2,

          ttlMs:
            60_000
        }
      });

    assert.ok(
      preset.service.sessions
    );
  }
);

test(
  "GitHub preset configures preflight dependencies by default",
  async () => {
    const preset =
      createGitHubAuthorizationPresetV2({
        apiBaseUrl:
          "https://api.github.test"
      });

    await assert.rejects(
      preset.service.preflight({
        session_id:
          "missing-session"
      }),
      (error) =>
        error instanceof
          AuthorizationSessionStoreErrorV2 &&
        error.code ===
          "NOT_FOUND"
    );
  }
);

test(
  "GitHub preset can reuse an explicitly supplied trusted context store",
  () => {
    const contextStore =
      new TrustedExecutionContextStoreV2();

    const preset =
      createGitHubAuthorizationPresetV2({
        apiBaseUrl:
          "https://api.github.test",

        executionContextStore:
          contextStore
      });

    assert.equal(
      preset.contextStore,
      contextStore
    );
  }
);

test(
  "GitHub preset enables write execution only with explicit execution configuration",
  () => {
    const preset =
      createGitHubAuthorizationPresetV2({
        apiBaseUrl:
          "https://api.github.test",

        execution: {
          token:
            "write-only-secret",

          allowedRepositories: [
            "touhaf00/contextguard"
          ],

          apiBaseUrl:
            "https://api.github.test"
        }
      });

    assert.ok(
      preset.executionTransport
    );

    assert.ok(
      preset.executor
    );
  }
);

test(
  "GitHub preset keeps execution token encapsulated and separate from snapshot client",
  () => {
    const preset =
      createGitHubAuthorizationPresetV2({
        token:
          "read-token",

        apiBaseUrl:
          "https://api.github.test",

        execution: {
          token:
            "write-token",

          allowedRepositories: [
            "touhaf00/contextguard"
          ],

          apiBaseUrl:
            "https://api.github.test"
        }
      });

    assert.equal(
      "token" in preset.client,
      false
    );

    assert.equal(
      "token" in preset.executionTransport,
      false
    );

    assert.equal(
      "token" in preset.executor,
      false
    );

    assert.equal(
      "token" in preset.service,
      false
    );
  }
);

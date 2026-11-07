import assert from "node:assert/strict";
import test from "node:test";

import {
  digestCanonicalJson
} from "../dist/core/authorization-integrity.js";

import {
  TrustedExecutorStateErrorV2,
  validateTrustedExecutionAuthorizationV2
} from "../dist/core/trusted-executor.js";

import {
  GitHubTrustedExecutorErrorV2,
  GitHubTrustedExecutorV2
} from "../dist/adapters/github/trusted-executor.js";

function buildAuthorization({
  repository =
    "touhaf00/contextguard",

  provider =
    "github",

  resourceType =
    "repository_ref",

  namespace =
    "github",

  action =
    "create_issue",

  parameters = {
    title:
      "ContextGuard controlled execution test",

    body:
      "Created through a single-use ContextGuard authorization."
  }
} = {}) {
  const proposedAction = {
    namespace,
    action,
    parameters
  };

  const receiptBase = {
    receipt_version:
      "2",

    receipt_id:
      "receipt-github-executor-1",

    session_id:
      "session-github-executor-1",

    request_id:
      "request-github-executor-1",

    lock_id:
      "lock-github-executor-1",

    lock_fingerprint:
      "a".repeat(64),

    status:
      "AUTHORIZED_FOR_EXECUTOR",

    subject: {
      provider,

      resource_type:
        resourceType,

      resource_id:
        repository,

      selector: {
        kind:
          "branch",

        ref:
          "main"
      }
    },

    snapshot_id:
      "github:snapshot-1",

    authorized_snapshot_version:
      "1".repeat(40),

    proposed_action:
      proposedAction,

    action_digest:
      digestCanonicalJson(
        proposedAction
      ),

    policy_digest:
      "b".repeat(64),

    runtime_digest:
      "c".repeat(64),

    approval_requirement:
      "REQUIRED",

    approval_id:
      "approval-github-executor-1",

    approval_principal_id:
      "operator",

    approval_record_digest:
      "d".repeat(64),

    approval_attestation_digest:
      "e".repeat(64),

    preflight_checked_at:
      "2026-11-02T02:10:00.000Z",

    preflight_response_digest:
      "f".repeat(64),

    issued_at:
      "2026-11-02T02:10:30.000Z",

    expires_at:
      "2026-11-02T02:20:00.000Z",

    execution_configured:
      false,

    external_action_executed:
      false
  };

  const receipt = {
    ...receiptBase,

    receipt_digest:
      digestCanonicalJson(
        receiptBase
      )
  };

  const consumptionBase = {
    consumption_version:
      "2",

    consumption_id:
      "consumption-github-executor-1",

    receipt_id:
      receipt.receipt_id,

    receipt_digest:
      receipt.receipt_digest,

    lock_id:
      receipt.lock_id,

    lock_fingerprint:
      receipt.lock_fingerprint,

    action_digest:
      receipt.action_digest,

    authorized_snapshot_version:
      receipt.authorized_snapshot_version,

    status:
      "CONSUMED_FOR_EXECUTION",

    consumed_at:
      "2026-11-02T02:12:00.000Z",

    execution_configured:
      false,

    external_action_executed:
      false
  };

  const consumption = {
    ...consumptionBase,

    consumption_digest:
      digestCanonicalJson(
        consumptionBase
      )
  };

  return validateTrustedExecutionAuthorizationV2(
    receipt,
    consumption,
    {
      checkedAt:
        "2026-11-02T02:13:00.000Z"
    }
  );
}

function matchingStateResolver({
  version =
    "1".repeat(40),

  snapshotId =
    "github:snapshot-1",

  observedAt =
    "2026-11-02T02:13:30.000Z",

  onResolve
} = {}) {
  return {
    resolver_version:
      "2",

    resolver_id:
      "github.test-execution-state",

    provider:
      "github",

    supports(
      subject
    ) {
      return (
        subject.provider ===
          "github" &&
        subject.resource_type ===
          "repository_ref"
      );
    },

    async resolve(
      subject
    ) {
      if (
        onResolve
      ) {
        onResolve();
      }

      return {
        snapshot_id:
          snapshotId,

        subject,

        version,

        observed_at:
          observedAt,

        metadata: {
          source:
            "test"
        }
      };
    }
  };
}

function executor(
  transport,
  repositories = [
    "touhaf00/contextguard"
  ],
  stateResolver =
    matchingStateResolver()
) {
  return new GitHubTrustedExecutorV2({
    transport,

    stateResolver,

    allowedRepositories:
      repositories,

    now() {
      return new Date(
        "2026-11-02T02:14:00.000Z"
      );
    }
  });
}

function expectCode(
  promise,
  code
) {
  return assert.rejects(
    promise,
    error =>
      error instanceof
        GitHubTrustedExecutorErrorV2 &&
      error.code ===
        code
  );
}

test(
  "GitHub trusted executor performs only the exact authorized create_issue action",
  async () => {
    const calls =
      [];

    const trustedExecutor =
      executor({
        async createIssue(
          repository,
          input
        ) {
          calls.push({
            repository,
            input
          });

          return {
            issue_number:
              42,

            html_url:
              "https://github.com/touhaf00/contextguard/issues/42"
          };
        }
      });

    const result =
      await trustedExecutor
        .execute(
          buildAuthorization()
        );

    assert.equal(
      calls.length,
      1
    );

    assert.deepEqual(
      calls[0],
      {
        repository:
          "touhaf00/contextguard",

        input: {
          title:
            "ContextGuard controlled execution test",

          body:
            "Created through a single-use ContextGuard authorization."
        }
      }
    );

    assert.equal(
      result.status,
      "EXECUTED"
    );

    assert.equal(
      result.external_action_executed,
      true
    );

    assert.equal(
      result.issue_number,
      42
    );
  }
);

test(
  "GitHub trusted executor rejects repositories outside its allowlist",
  async () => {
    let called =
      false;

    const trustedExecutor =
      executor({
        async createIssue() {
          called =
            true;

          return {
            issue_number:
              1,

            html_url:
              "https://github.com/attacker/repo/issues/1"
          };
        }
      });

    await expectCode(
      trustedExecutor.execute(
        buildAuthorization({
          repository:
            "attacker/repo"
        })
      ),
      "UNSUPPORTED_RESOURCE"
    );

    assert.equal(
      called,
      false
    );
  }
);

test(
  "GitHub trusted executor rejects non GitHub providers",
  async () => {
    const trustedExecutor =
      executor({
        async createIssue() {
          throw new Error(
            "must not run"
          );
        }
      });

    await expectCode(
      trustedExecutor.execute(
        buildAuthorization({
          provider:
            "stripe"
        })
      ),
      "UNSUPPORTED_PROVIDER"
    );
  }
);

test(
  "GitHub trusted executor rejects non repository_ref resources",
  async () => {
    const trustedExecutor =
      executor({
        async createIssue() {
          throw new Error(
            "must not run"
          );
        }
      });

    await expectCode(
      trustedExecutor.execute(
        buildAuthorization({
          resourceType:
            "issue"
        })
      ),
      "UNSUPPORTED_RESOURCE"
    );
  }
);

test(
  "GitHub trusted executor rejects every action outside explicit allowlist",
  async () => {
    let called =
      false;

    const trustedExecutor =
      executor({
        async createIssue() {
          called =
            true;

          return {
            issue_number:
              1,

            html_url:
              "https://github.com/touhaf00/contextguard/issues/1"
          };
        }
      });

    await expectCode(
      trustedExecutor.execute(
        buildAuthorization({
          action:
            "delete_repository"
        })
      ),
      "ACTION_NOT_ALLOWED"
    );

    assert.equal(
      called,
      false
    );
  }
);

test(
  "GitHub trusted executor rejects another action namespace",
  async () => {
    const trustedExecutor =
      executor({
        async createIssue() {
          throw new Error(
            "must not run"
          );
        }
      });

    await expectCode(
      trustedExecutor.execute(
        buildAuthorization({
          namespace:
            "system"
        })
      ),
      "ACTION_NOT_ALLOWED"
    );
  }
);

test(
  "GitHub trusted executor rejects unsupported create_issue parameters",
  async () => {
    let called =
      false;

    const trustedExecutor =
      executor({
        async createIssue() {
          called =
            true;

          return {
            issue_number:
              1,

            html_url:
              "https://github.com/touhaf00/contextguard/issues/1"
          };
        }
      });

    await expectCode(
      trustedExecutor.execute(
        buildAuthorization({
          parameters: {
            title:
              "Trusted title",

            body:
              "Trusted body",

            labels: [
              "admin"
            ]
          }
        })
      ),
      "INVALID_PARAMETERS"
    );

    assert.equal(
      called,
      false
    );
  }
);

test(
  "GitHub trusted executor revalidates authorization immediately before transport",
  async () => {
    let called =
      false;

    const authorization =
      buildAuthorization();

    authorization
      .receipt
      .proposed_action
      .parameters
      .title =
      "tampered";

    const trustedExecutor =
      executor({
        async createIssue() {
          called =
            true;

          return {
            issue_number:
              1,

            html_url:
              "https://github.com/touhaf00/contextguard/issues/1"
          };
        }
      });

    await expectCode(
      trustedExecutor.execute(
        authorization
      ),
      "INVALID_AUTHORIZATION"
    );

    assert.equal(
      called,
      false
    );
  }
);

test(
  "GitHub transport failure never reports successful execution",
  async () => {
    const trustedExecutor =
      executor({
        async createIssue() {
          throw new Error(
            "network denied"
          );
        }
      });

    await expectCode(
      trustedExecutor.execute(
        buildAuthorization()
      ),
      "EXECUTION_FAILED"
    );
  }
);

test(
  "GitHub trusted executor rejects malformed provider result",
  async () => {
    const trustedExecutor =
      executor({
        async createIssue() {
          return {
            issue_number:
              0,

            html_url:
              "not-a-github-url"
          };
        }
      });

    await expectCode(
      trustedExecutor.execute(
        buildAuthorization()
      ),
      "INVALID_RESULT"
    );
  }
);

test(
  "GitHub trusted executor records completion after provider transport returns",
  async () => {
    const times = [
      new Date(
        "2026-11-02T02:14:00.000Z"
      ),

      new Date(
        "2026-11-02T02:15:00.000Z"
      )
    ];

    const trustedExecutor =
      new GitHubTrustedExecutorV2({
        stateResolver:
          matchingStateResolver(),

        transport: {
          async createIssue() {
            return {
              issue_number:
                99,

              html_url:
                "https://github.com/touhaf00/contextguard/issues/99"
            };
          }
        },

        allowedRepositories: [
          "touhaf00/contextguard"
        ],

        now() {
          return times.shift();
        }
      });

    const result =
      await trustedExecutor.execute(
        buildAuthorization()
      );

    assert.equal(
      result.completed_at,
      "2026-11-02T02:15:00.000Z"
    );
  }
);

test(
  "GitHub trusted executor revalidates provider state immediately before transport",
  async () => {
    const order =
      [];

    const trustedExecutor =
      executor(
        {
          async createIssue() {
            order.push(
              "transport"
            );

            return {
              issue_number:
                101,

              html_url:
                "https://github.com/touhaf00/contextguard/issues/101"
            };
          }
        },
        [
          "touhaf00/contextguard"
        ],
        matchingStateResolver({
          onResolve() {
            order.push(
              "resolve"
            );
          }
        })
      );

    const result =
      await trustedExecutor.execute(
        buildAuthorization()
      );

    assert.deepEqual(
      order,
      [
        "resolve",
        "transport"
      ]
    );

    assert.equal(
      result.execution_snapshot_version,
      "1".repeat(40)
    );

    assert.equal(
      result.execution_snapshot_id,
      "github:snapshot-1"
    );

    assert.equal(
      result.execution_state_checked_at,
      "2026-11-02T02:13:30.000Z"
    );
  }
);

test(
  "GitHub trusted executor blocks execution when provider state changed after authorization",
  async () => {
    let called =
      false;

    const trustedExecutor =
      executor(
        {
          async createIssue() {
            called =
              true;

            throw new Error(
              "must not run"
            );
          }
        },
        [
          "touhaf00/contextguard"
        ],
        matchingStateResolver({
          version:
            "2".repeat(40),

          snapshotId:
            "github:changed-snapshot"
        })
      );

    await assert.rejects(
      trustedExecutor.execute(
        buildAuthorization()
      ),
      error =>
        error instanceof
          TrustedExecutorStateErrorV2 &&
        error.code ===
          "STATE_CHANGED"
    );

    assert.equal(
      called,
      false
    );
  }
);

test(
  "GitHub trusted executor fails closed when fresh provider state is unavailable",
  async () => {
    let called =
      false;

    const stateResolver = {
      resolver_version:
        "2",

      resolver_id:
        "github.test-unavailable",

      provider:
        "github",

      supports() {
        return true;
      },

      async resolve() {
        throw new Error(
          "GitHub unavailable"
        );
      }
    };

    const trustedExecutor =
      executor(
        {
          async createIssue() {
            called =
              true;

            throw new Error(
              "must not run"
            );
          }
        },
        [
          "touhaf00/contextguard"
        ],
        stateResolver
      );

    await assert.rejects(
      trustedExecutor.execute(
        buildAuthorization()
      ),
      error =>
        error instanceof
          TrustedExecutorStateErrorV2 &&
        error.code ===
          "STATE_UNAVAILABLE"
    );

    assert.equal(
      called,
      false
    );
  }
);

test("A new issue is refused right before the write when an open issue already has its exact title", async () => {
  const order = [];
  const stateResolver = matchingStateResolver({ onResolve() { order.push("branch"); } });
  const trustedExecutor = executor({
    async findOpenIssuesWithTitle(repository, title) {
      order.push("open-issues");
      assert.equal(repository, "touhaf00/contextguard");
      assert.equal(title, "ContextGuard controlled execution test");
      return [17];
    },
    async createIssue() { order.push("write"); throw new Error("must not run"); }
  }, ["touhaf00/contextguard"], stateResolver);
  await assert.rejects(
    trustedExecutor.execute(buildAuthorization()),
    error => error instanceof TrustedExecutorStateErrorV2 && error.code === "STATE_CHANGED" &&
      /^GITHUB_DUPLICATE_ISSUE: .*\(#17\)\. Nothing was written to GitHub\.$/.test(error.message)
  );
  assert.deepEqual(order, ["branch", "open-issues"]);
});

test("A new issue is refused when the open issues cannot be read right before the write", async () => {
  let written = false;
  const trustedExecutor = executor({
    async findOpenIssuesWithTitle() { throw new Error("GitHub open issues read returned HTTP 502."); },
    async createIssue() { written = true; throw new Error("must not run"); }
  });
  await assert.rejects(
    trustedExecutor.execute(buildAuthorization()),
    error => error instanceof TrustedExecutorStateErrorV2 && error.code === "STATE_UNAVAILABLE"
  );
  assert.equal(written, false);
});

test("Without a duplicate the issue is written once, after the open issues were read", async () => {
  const order = [];
  const trustedExecutor = executor({
    async findOpenIssuesWithTitle() { order.push("open-issues"); return []; },
    async createIssue() {
      order.push("write");
      return { issue_number: 43, html_url: "https://github.com/touhaf00/contextguard/issues/43" };
    }
  });
  const result = await trustedExecutor.execute(buildAuthorization());
  assert.equal(result.status, "EXECUTED");
  assert.equal(result.issue_number, 43);
  assert.deepEqual(order, ["open-issues", "write"]);
});

test("A transport without the open-issue read keeps the previous behaviour", async () => {
  let writes = 0;
  const trustedExecutor = executor({
    async createIssue() {
      writes++;
      return { issue_number: 44, html_url: "https://github.com/touhaf00/contextguard/issues/44" };
    }
  });
  assert.equal((await trustedExecutor.execute(buildAuthorization())).issue_number, 44);
  assert.equal(writes, 1);
});

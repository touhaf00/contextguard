import assert from "node:assert/strict";
import test from "node:test";

import {
  runGuardWithSingleConsistencyRetryV2
} from "../dist/api/ui/cominty-pipeline.js";


test(
  "missing Guard claim classification gets exactly one targeted retry",
  async () => {
    const calls = [];

    const result =
      await runGuardWithSingleConsistencyRetryV2({
        guardPrompt:
          "ORIGINAL GUARD PROMPT",

        claimIds:
          ["C1", "C2"],

        warn() {},

        async runGuardOnce(message) {
          calls.push(message);

          if (calls.length === 1) {
            throw new Error(
              "GuardVerificationV2 did not classify Worker claim_id: C2."
            );
          }

          return {
            verdict:
              "PASS"
          };
        }
      });

    assert.deepEqual(
      result,
      {
        verdict:
          "PASS"
      }
    );

    assert.equal(
      calls.length,
      2
    );

    assert.equal(
      calls[0],
      "ORIGINAL GUARD PROMPT"
    );

    assert.match(
      calls[1],
      /previous response omitted Worker claim_id C2/
    );

    assert.match(
      calls[1],
      /\["C1","C2"\]/
    );

    assert.match(
      calls[1],
      /This is the ONLY retry/
    );
  }
);


test(
  "requested_check mismatch gets exactly one targeted retry",
  async () => {
    const calls = [];

    const result =
      await runGuardWithSingleConsistencyRetryV2({
        guardPrompt:
          "ORIGINAL GUARD PROMPT",

        claimIds:
          ["C1"],

        warn() {},

        async runGuardOnce(message) {
          calls.push(message);

          if (calls.length === 1) {
            throw new Error(
              "GuardVerificationV2.requested_checks[0].check must exactly match the finding required_check."
            );
          }

          return {
            verdict:
              "REVIEW"
          };
        }
      });

    assert.equal(
      result.verdict,
      "REVIEW"
    );

    assert.equal(
      calls.length,
      2
    );

    assert.match(
      calls[1],
      /requested_checks\[\]\.check value/
    );

    assert.match(
      calls[1],
      /copied EXACTLY, character-for-character/
    );
  }
);


test(
  "unrelated Guard validation error gets no retry and fails closed",
  async () => {
    let calls = 0;

    await assert.rejects(
      () =>
        runGuardWithSingleConsistencyRetryV2({
          guardPrompt:
            "ORIGINAL GUARD PROMPT",

          claimIds:
            ["C1"],

          warn() {},

          async runGuardOnce() {
            calls += 1;

            throw new Error(
              "GuardVerificationV2 contains an unknown Worker claim_id."
            );
          }
        }),
      /unknown Worker claim_id/
    );

    assert.equal(
      calls,
      1
    );
  }
);


test(
  "invalid targeted retry fails after exactly two Guard calls",
  async () => {
    let calls = 0;

    await assert.rejects(
      () =>
        runGuardWithSingleConsistencyRetryV2({
          guardPrompt:
            "ORIGINAL GUARD PROMPT",

          claimIds:
            ["C1", "C2"],

          warn() {},

          async runGuardOnce() {
            calls += 1;

            throw new Error(
              "GuardVerificationV2 did not classify Worker claim_id: C2."
            );
          }
        }),
      /did not classify Worker claim_id: C2/
    );

    assert.equal(
      calls,
      2
    );
  }
);


test(
  "server GitHub observation matches snapshot",
  async () => {
    const { readGitHubBranchForAgentV2 } =
      await import("../dist/api/ui/cominty-pipeline.js");

    const sha = "a".repeat(40);

    const request = {
      subject: {
        provider: "github",
        resource_type: "repository_ref",
        resource_id: "touhaf00/tp-cicd",
        selector: {
          kind: "branch",
          ref: "contextguard-drift-demo-20261104"
        }
      },
      snapshot: { version: sha }
    };

    let calls = 0;

    const reader = {
      async getRef() {
        calls++;
        return {
          object: { type: "commit", sha }
        };
      },
      async getCommit() {
        calls++;
        return { sha };
      }
    };

    const result = await readGitHubBranchForAgentV2(
      request,
      reader
    );

    assert.equal(result.sha, sha);
    assert.equal(calls, 2);
    assert.ok(Date.parse(result.observed_at));
  }
);

test(
  "server GitHub observation rejects drift",
  async () => {
    const { readGitHubBranchForAgentV2 } =
      await import("../dist/api/ui/cominty-pipeline.js");

    const request = {
      subject: {
        provider: "github",
        resource_type: "repository_ref",
        resource_id: "touhaf00/tp-cicd",
        selector: {
          kind: "branch",
          ref: "contextguard-drift-demo-20261104"
        }
      },
      snapshot: {
        version: "a".repeat(40)
      }
    };

    const reader = {
      async getRef() {
        return {
          object: {
            type: "commit",
            sha: "b".repeat(40)
          }
        };
      },
      async getCommit() {
        return { sha: "b".repeat(40) };
      }
    };

    await assert.rejects(
      readGitHubBranchForAgentV2(request, reader),
      /GITHUB_OBSERVATION_CHANGED/
    );
  }
);

test(
  "server GitHub observation refuses malformed provider data",
  async () => {
    const { readGitHubBranchForAgentV2 } =
      await import("../dist/api/ui/cominty-pipeline.js");

    const request = {
      subject: {
        provider: "github",
        resource_type: "repository_ref",
        resource_id: "touhaf00/tp-cicd",
        selector: {
          kind: "branch",
          ref: "contextguard-drift-demo-20261104"
        }
      },
      snapshot: {
        version: "a".repeat(40)
      }
    };

    await assert.rejects(
      readGitHubBranchForAgentV2(
        request,
        {
          async getRef() {
            return {
              object: {
                type: "tree",
                sha: "a".repeat(40)
              }
            };
          },
          async getCommit() {
            throw new Error("Must not be called");
          }
        }
      ),
      /GitHub branch ref\.object\.type must be commit or tag/
    );
  }
);


test(
  "issue listing reports no open duplicate",
  async () => {
    const { readGitHubIssueStateForAgentV2 } =
      await import("../dist/api/ui/cominty-pipeline.js");

    const request = {
      subject: {
        provider: "github",
        resource_type: "repository_ref",
        resource_id: "touhaf00/tp-cicd"
      },
      proposed_action: {
        namespace: "github",
        action: "create_issue",
        parameters: { title: "Test issue" }
      }
    };

    const result = await readGitHubIssueStateForAgentV2(
      request,
      {
        async getOpenIssues() {
          return [];
        }
      }
    );

    assert.equal(result.open_issue_count, 0);
    assert.deepEqual(result.matching_open_issue_numbers, []);
    assert.equal(result.pages_read, 1);
  }
);

test(
  "issue listing detects an existing open duplicate",
  async () => {
    const { readGitHubIssueStateForAgentV2 } =
      await import("../dist/api/ui/cominty-pipeline.js");

    const request = {
      subject: {
        provider: "github",
        resource_type: "repository_ref",
        resource_id: "touhaf00/tp-cicd"
      },
      proposed_action: {
        namespace: "github",
        action: "create_issue",
        parameters: { title: "Test issue" }
      }
    };

    const result = await readGitHubIssueStateForAgentV2(
      request,
      {
        async getOpenIssues() {
          return [{
            number: 42,
            title: "test issue",
            state: "open"
          }];
        }
      }
    );

    assert.equal(result.open_issue_count, 1);
    assert.deepEqual(
      result.matching_open_issue_numbers,
      [42]
    );
  }
);

test(
  "issue listing fails closed on invalid provider response",
  async () => {
    const { readGitHubIssueStateForAgentV2 } =
      await import("../dist/api/ui/cominty-pipeline.js");

    const request = {
      subject: {
        provider: "github",
        resource_type: "repository_ref",
        resource_id: "touhaf00/tp-cicd"
      },
      proposed_action: {
        namespace: "github",
        action: "create_issue",
        parameters: { title: "Test issue" }
      }
    };

    await assert.rejects(
      readGitHubIssueStateForAgentV2(
        request,
        {
          async getOpenIssues() {
            return { items: [] };
          }
        }
      ),
      /issues response is invalid/
    );
  }
);


test(
  "agents are explicitly instructed to verify GitHub using tools",
  async () => {
    const { requiredGitHubToolChecksPromptV2 } =
      await import("../dist/api/ui/cominty-pipeline.js");

    const request = {
      subject: {
        provider: "github",
        resource_type: "repository_ref",
        resource_id: "touhaf00/tp-cicd",
        selector: {
          kind: "branch",
          ref: "contextguard-drift-demo-20261104"
        }
      },
      proposed_action: {
        namespace: "github",
        action: "create_issue",
        parameters: {
          title: "ContextGuard test - verify CI evidence"
        }
      }
    };

    for (const role of ["WORKER", "GUARD"]) {
      const prompt = requiredGitHubToolChecksPromptV2(
        request,
        role
      );

      assert.match(prompt, /list_commits/);
      assert.match(prompt, /list_issues/);
      assert.match(prompt, /READ-ONLY/);
      assert.match(prompt, /Do not force READY or PASS/);
      assert.match(
        prompt,
        /contextguard-drift-demo-20261104/
      );
    }
  }
);

test("new agent-native workflow supports any selected GitHub repository in read-only checks", async () => {
  const { readGitHubBranchForAgentV2, requiredGitHubToolChecksPromptV2 } =
    await import("../dist/api/ui/cominty-pipeline.js");
  const sha = "c".repeat(40);
  const request = {
    subject: {provider:"github",resource_type:"repository_ref",resource_id:"test-org/example",selector:{kind:"branch",ref:"feature/demo"}},
    snapshot:{version:sha}, proposed_action:{namespace:"github",action:"create_issue",parameters:{title:"Investigate CI status"}}
  };
  const result = await readGitHubBranchForAgentV2(request,{
    async getRef(repo,kind,ref){assert.equal(repo,"test-org/example");assert.equal(kind,"heads");assert.equal(ref,"feature/demo");return{object:{type:"commit",sha}}},
    async getCommit(repo,ref){assert.equal(repo,"test-org/example");return {sha:ref}}
  });
  assert.equal(result.sha,sha);
  const prompt = requiredGitHubToolChecksPromptV2(request,"GUARD");
  assert.match(prompt,/test-org\/example/);
  assert.doesNotMatch(prompt,/Repository: touhaf00\/tp-cicd/);
});

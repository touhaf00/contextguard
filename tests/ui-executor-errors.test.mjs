import assert from "node:assert/strict";
import test from "node:test";
import { pipelineHttpError } from "../dist/api/ui/pipeline-errors.js";
import { TrustedExecutorStateErrorV2 } from "../dist/core/trusted-executor.js";
import { GitHubTrustedExecutorErrorV2 } from "../dist/adapters/github/trusted-executor.js";

test("A refusal made immediately before the write says that nothing was written, in fixed text", () => {
  const duplicate = pipelineHttpError(new TrustedExecutorStateErrorV2(
    "STATE_CHANGED",
    "GITHUB_DUPLICATE_ISSUE: an open issue with exactly this title already exists (#17). Nothing was written to GitHub."
  ));
  assert.equal(duplicate.status, 409);
  assert.match(duplicate.message, /exactly this title was found immediately before the write/);
  assert.match(duplicate.message, /Nothing was written to GitHub\./);
  assert.doesNotMatch(duplicate.message, /GITHUB_|#17/);

  const moved = pipelineHttpError(new TrustedExecutorStateErrorV2("STATE_CHANGED", "GitHub resource state changed after authorization."));
  assert.equal(moved.status, 409);
  assert.match(moved.message, /branch changed after your approval.*Nothing was written to GitHub\. Prepare a new proposal\./);

  const unreadable = pipelineHttpError(new TrustedExecutorStateErrorV2("STATE_UNAVAILABLE", "Fresh GitHub open issues are unavailable."));
  assert.equal(unreadable.status, 503);
  assert.match(unreadable.message, /Nothing was written to GitHub\./);
});

test("A write GitHub did not confirm is never reported as not written", () => {
  for (const code of ["EXECUTION_FAILED", "INVALID_RESULT"]) {
    const mapped = pipelineHttpError(new GitHubTrustedExecutorErrorV2(code, "GitHub execution failed: socket hang up ghp_SECRET"));
    assert.equal(mapped.status, 502, code);
    assert.match(mapped.message, /may or may not have happened\. Check the repository on GitHub/, code);
    assert.doesNotMatch(mapped.message, /Nothing was written|ghp_|socket/, code);
  }
  assert.equal(pipelineHttpError(new GitHubTrustedExecutorErrorV2("ACTION_NOT_ALLOWED", "x")), null);
});

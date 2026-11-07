import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  referencedGitHubCodePathsV2,
  decodeGitHubFileV2,
  readGitHubSourceEvidenceForAgentV2,
  formatGitHubSourceEvidenceForAgentV2
} from "../dist/api/ui/github-source-evidence.js";

const REPO = "touhaf00/tp-cicd";
const SHA = "b182a69150a65b60217ef9758b1fd771f64e7d1a";
const BODY = "Review `.github/workflows/ci-cd.yml`, `app.py`, and `test_app.py` for CI semantics.";
const request = {
  subject: { provider: "github", resource_type: "repository_ref", resource_id: REPO, selector: { kind: "branch", ref: "main" } },
  snapshot: { version: SHA },
  proposed_action: { namespace: "github", action: "create_issue", parameters: { title: "Improve release verification", body: BODY } }
};

function blob(path, content) {
  const bytes = Buffer.from(content, "utf8");
  const sha = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  return { type: "file", path, encoding: "base64", sha, size: bytes.length, content: bytes.toString("base64") };
}

function provider({ sha = SHA, inaccessible = [] } = {}) {
  return {
    async getCommit(repo, ref) {
      assert.equal(repo, REPO);
      assert.equal(ref, SHA);
      return { sha, files: [{ filename: "app.py", patch: '@@ -2 +2 @@\n-    print(addition(10, 20))\n+    print(addition(20, 30))' }] };
    },
    async getFileAtCommit(repo, path, ref) {
      assert.equal(repo, REPO);
      assert.equal(ref, SHA);
      if (inaccessible.includes(path)) throw new Error("404");
      return blob(path, path === "app.py" ? "print(addition(20, 30))\n" : "# checked source content\n");
    }
  };
}

test("extracts only bounded source-code file paths from an AI-authored issue", () => {
  assert.deepEqual(referencedGitHubCodePathsV2(BODY), [".github/workflows/ci-cd.yml", "app.py", "test_app.py"]);
  assert.deepEqual(referencedGitHubCodePathsV2("Ignore `.env`, `credentials.json`, `../secret.py`, `app.py`"), ["app.py"]);
  assert.equal(referencedGitHubCodePathsV2("`app.py` `.github/workflows/a.yml` `a.py` `b.py` `c.py`").length, 4);
});

test("server observes the GitHub source at the exact immutable commit, with verified blob bytes and commit patch", async () => {
  const result = await readGitHubSourceEvidenceForAgentV2(request, provider());
  assert.equal(result.sha, SHA);
  assert.equal(result.files.length, 3);
  assert.equal(result.files.every(f => f.state === "VERIFIED"), true);
  assert.match(result.files.find(f => f.path === "app.py").content, /addition\(20, 30\)/);
  assert.match(result.changes[0].patch, /addition\(10, 20\)/);
  assert.match(formatGitHubSourceEvidenceForAgentV2(result, "GUARD"), /SERVER calls/);
  assert.match(formatGitHubSourceEvidenceForAgentV2(result, "WORKER"), /UNAVAILABLE/);
});

test("unavailable GitHub source is explicitly not counted as verified evidence", async () => {
  const result = await readGitHubSourceEvidenceForAgentV2(request, provider({ inaccessible: ["app.py"] }));
  assert.equal(result.files.find(f => f.path === "app.py").state, "UNAVAILABLE");
  assert.equal("content" in result.files.find(f => f.path === "app.py"), false);
});

test("commit mismatches fail closed before any file read", async () => {
  let files = 0;
  await assert.rejects(readGitHubSourceEvidenceForAgentV2(request, {
    async getCommit() { return { sha: "f".repeat(40), files: [] }; },
    async getFileAtCommit() { files++; throw new Error("not used"); }
  }), /SHA mismatch/);
  assert.equal(files, 0);
});

test("tampered GitHub file payload cannot become verified source evidence", () => {
  const corrupt = blob("app.py", "original");
  corrupt.content = Buffer.from("modified").toString("base64");
  assert.throws(() => decodeGitHubFileV2(corrupt, "app.py"), /blob|bytes/);
  assert.throws(() => decodeGitHubFileV2(blob("other.py", "safe"), "app.py"), /verified file/);
});

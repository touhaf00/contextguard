import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { normalizeIssue, fingerprintIssue } from "../dist/adapters/github/issue-maintenance.js";
import { readIssueEvidenceVariants } from "../dist/api/ui/cominty-pipeline.js";
import {
  mentionedRepositoryPathsV2,
  readMentionedRepositoryFilesV2,
  renderRepositoryFileV2,
  resolveMentionedPathsV2,
  testFilesForV2
} from "../dist/api/ui/repository-file-evidence.js";
import { CodeFixGitHubApi } from "../dist/api/ui/github-code-fix.js";

const repo = "touhaf00/contextguard-video-demo";
const sha = "09ed8547d7268574807b7851a43345036a1504f6";
const blob = text => createHash("sha1").update(`blob ${Buffer.byteLength(text, "utf8")}\0`).update(text, "utf8").digest("hex");

const FILES = {
  "calculator.py": 'def add(a, b):\n    """Return the sum of a and b."""\n    return a + b\n\n\ndef average(numbers):\n    return sum(numbers) / (len(numbers) + 1)\n',
  "README.md": "# contextguard-video-demo\n\nA small calcualtor library for Python.\n\n## Install\n\n```bash\n# Usage: not a heading, this is inside a code block\npip install -e .\n```\n",
  "tests/test_calculator.py": "import unittest\nfrom calculator import add, average\n\n\nclass CalculatorTests(unittest.TestCase):\n    def test_average(self):\n        self.assertEqual(average([2, 4, 6]), 4)\n",
  ".github/workflows/ci.yml": "name: CI\non: push\n"
};

function reader({ tree = true, files = FILES, failing = [] } = {}) {
  const calls = { files: [], tree: 0 };
  const client = {
    calls,
    async getFileAtCommit(r, path, ref) {
      calls.files.push(path);
      assert.equal(r, repo);
      assert.equal(ref, sha);
      if (failing.includes(path)) throw new Error("GitHub request failed with HTTP 500.");
      if (!(path in files)) throw new Error("GitHub request failed with HTTP 404.");
      const text = files[path];
      return { type: "file", path, encoding: "base64", content: Buffer.from(text).toString("base64"), sha: blob(text), size: Buffer.byteLength(text) };
    }
  };
  if (tree) {
    client.getTreeAtCommit = async (r, ref) => {
      calls.tree++;
      assert.equal(ref, sha);
      return { truncated: false, tree: Object.keys(files).map(path => ({ path, type: "blob" })) };
    };
  }
  return client;
}

test("The names of files are found in links, quotes, plain text and the word README, never a secret or hidden one", () => {
  const texts = [
    "Typo in the README",
    `Done in [calculator.py](https://github.com/${repo}/blob/${sha}/calculator.py). See \`tests/test_calculator.py\`, and setup.cfg.`,
    "Also docs/guide.md, calculator.py:24 and https://github.com/other/repo/blob/main/evil.py.",
    "Never: .env, config/.env.production, secrets.json, deploy/id_rsa, certs/server.pem, .npmrc, node_modules/x/index.js"
  ];
  assert.deepEqual(mentionedRepositoryPathsV2(texts, repo), ["calculator.py", "tests/test_calculator.py", "docs/guide.md", "README"]);
  assert.deepEqual(mentionedRepositoryPathsV2(["e.g. v1.2.3, user@example.com, tests.test_calculator.CalculatorTests.test_average"], repo), []);
});

test("Names resolve against the files of the commit: exact path, a unique file name, the root README", () => {
  const tree = Object.keys(FILES);
  assert.deepEqual(resolveMentionedPathsV2(["test_calculator.py", "README", "missing.py", "ci.yml"], tree), {
    found: ["tests/test_calculator.py", "README.md", ".github/workflows/ci.yml"],
    missing: ["missing.py"]
  });
  assert.deepEqual(testFilesForV2(["calculator.py"], tree), ["tests/test_calculator.py"]);
});

test("Files are read at the locked commit, Git-blob verified; a name that is no file is NOT FOUND, never guessed", async () => {
  const client = reader();
  const files = await readMentionedRepositoryFilesV2(client, repo, sha, ["Closed by mistake: README.md still has no Usage section.", "and CONTRIBUTING.md"]);
  assert.deepEqual(files.map(f => [f.path, f.state]), [["README.md", "READ"], ["CONTRIBUTING.md", "NOT_FOUND"]]);
  assert.deepEqual(client.calls.files, ["README.md"], "a name absent from the commit is not read");
  assert.equal(files[0].git_blob_sha, blob(FILES["README.md"]));

  const direct = await readMentionedRepositoryFilesV2(reader({ tree: false, failing: ["calculator.py"] }), repo, sha,
    ["README and calculator.py and nothere.py"]);
  assert.deepEqual(direct.map(f => [f.path, f.state]), [["calculator.py", "UNAVAILABLE"], ["nothere.py", "NOT_FOUND"], ["README.md", "READ"]]);

  assert.equal(await readMentionedRepositoryFilesV2({}, repo, sha, ["README.md"]), null);
  assert.deepEqual(await readMentionedRepositoryFilesV2(reader(), repo, sha, ["no file named here"]), []);
  assert.equal(await readMentionedRepositoryFilesV2(reader(), repo, "main", ["README.md"]), null, "only an exact commit");
});

test("A file that looks like it holds a credential is withheld, and a file whose bytes do not match its blob is unavailable", async () => {
  const leaky = { "notes.md": "token ghp_" + "a".repeat(36) + "\n" };
  const [withheld] = await readMentionedRepositoryFilesV2(reader({ files: leaky }), repo, sha, ["see notes.md"]);
  assert.equal(withheld.state, "WITHHELD");
  assert.equal(withheld.content, undefined);
  assert.doesNotMatch(renderRepositoryFileV2(withheld, 1000).join("\n"), /ghp_/);

  const tampered = reader();
  const original = tampered.getFileAtCommit;
  tampered.getFileAtCommit = async (...args) => ({ ...(await original(...args)), sha: "f".repeat(40) });
  const [bad] = await readMentionedRepositoryFilesV2(tampered, repo, sha, ["calculator.py"]);
  assert.equal(bad.state, "UNAVAILABLE");
});

test("A file is shown as numbered lines: COMPLETE when every line fits, otherwise an EXCERPT that says what was not shown", () => {
  const readme = { path: "README.md", state: "READ", content: FILES["README.md"], git_blob_sha: blob(FILES["README.md"]) };
  const complete = renderRepositoryFileV2(readme, 3500).join("\n");
  assert.match(complete, /^FILE `README\.md` \(Git blob [0-9a-f]{40}, COMPLETE: all 10 lines are shown\):\n```text\n1: # contextguard-video-demo\n/);
  assert.ok(complete.includes("3: A small calcualtor library for Python."));
  assert.ok(complete.includes("Headings of the whole file (computed by the server, outside code blocks): line 1: # contextguard-video-demo; line 5: ## Install."));
  assert.equal(complete.split("\n").filter(line => line === "```").length, 1, "a fence inside the file cannot close the block");

  const excerpt = renderRepositoryFileV2(readme, 60).join("\n");
  assert.match(excerpt, /EXCERPT: lines 1 to \d of 10 are shown; the rest is NOT OBSERVED here/);
  assert.ok(excerpt.includes("line 5: ## Install"), "the headings still cover the whole file");

  const long = { path: "a.py", state: "READ", content: "x".repeat(900), git_blob_sha: "1".repeat(40) };
  assert.match(renderRepositoryFileV2(long, 3500).join("\n"), /EXCERPT: lines 1 to 1 of 1 are shown, some shortened/);
  assert.equal(renderRepositoryFileV2({ path: "x.py", state: "NOT_FOUND" }, 100)[0], "FILE `x.py`: NOT FOUND at this commit.");
});

function maintenanceRequest(action, issue, params = {}) {
  const subject = { provider: "github", resource_type: "repository_ref", resource_id: repo, selector: { kind: "branch", ref: "main" } };
  return {
    subject,
    snapshot: { snapshot_id: "github:test", subject, version: sha, observed_at: new Date().toISOString() },
    proposed_action: { namespace: "github", action, parameters: { issue_number: issue.number, issue_fingerprint: fingerprintIssue(normalizeIssue(issue, repo)), ...params } }
  };
}
function issue(number, title, body, state = "open") {
  return { number, title, body, state, updated_at: "2026-11-07T12:00:00Z", labels: [], comments: 0, html_url: `https://github.com/${repo}/issues/${number}` };
}
function maintenanceReader(observed) {
  return { ...reader(), async getIssue() { return observed; } };
}

test("Closing an issue that reports a change: the changed file is shown, so completion can be observed, not only reported", async () => {
  const done = issue(4, "Add a docstring to add()",
    `**Status: done.** The docstring was added in commit ${sha} ([calculator.py](https://github.com/${repo}/blob/${sha}/calculator.py)).\n\nNothing else is left to do for this issue.`);
  const { full, brief } = await readIssueEvidenceVariants(maintenanceRequest("close_issue", done), maintenanceReader(done));
  for (const text of [full, brief]) {
    assert.match(text, new RegExp(`APPLICATION-READ REPOSITORY FILES \\(deterministic ContextGuard server code; Git-blob verified reads at the locked commit ${sha}\\)`));
    assert.ok(text.includes('2:     """Return the sum of a and b."""'), "the docstring line, exactly, with its quotes");
    assert.match(text, /FILE `calculator\.py` \(Git blob [0-9a-f]{40}, COMPLETE: all 7 lines are shown\)/);
    assert.match(text, /the APPLICATION-READ file below shows that change at the locked commit, the change is observed/);
    assert.match(text, /a SUPPORTING claim left UNKNOWN does not make READY inconsistent/);
  }
});

test("Reopening an issue about a missing section: the whole README and its headings are shown", async () => {
  const reopened = issue(5, "Add a usage section to the README", "Closed by mistake: README.md on main still has no Usage section.", "closed");
  const { full } = await readIssueEvidenceVariants(maintenanceRequest("reopen_issue", reopened), maintenanceReader(reopened));
  assert.match(full, /FILE `README\.md` \(Git blob [0-9a-f]{40}, COMPLETE: all 10 lines are shown\)/);
  assert.ok(full.includes("Headings of the whole file (computed by the server, outside code blocks): line 1: # contextguard-video-demo; line 5: ## Install."));
});

test("Commenting on a typo in the README: the README is read even when only the word README is used", async () => {
  const typo = issue(2, 'Typo in the README: "calcualtor"', "The first sentence reads 'A small calcualtor library for Python'.");
  const request = maintenanceRequest("comment_issue", typo, { body: "Thanks: the README typo is reported here; a maintainer can fix it." });
  const { full } = await readIssueEvidenceVariants(request, maintenanceReader(typo));
  assert.ok(full.includes("3: A small calcualtor library for Python."));
});

test("Without a locked commit, or with a reader that cannot read files, the evidence is unchanged", async () => {
  const typo = issue(2, 'Typo in the README: "calcualtor"', "The first sentence has a typo.");
  const request = maintenanceRequest("add_labels", typo, { labels: ["documentation"] });
  const { snapshot, ...withoutSnapshot } = request;
  const { full } = await readIssueEvidenceVariants(withoutSnapshot, maintenanceReader(typo));
  assert.doesNotMatch(full, /APPLICATION-READ REPOSITORY FILES/);
  const plain = { async getIssue() { return typo; } };
  assert.doesNotMatch((await readIssueEvidenceVariants(request, plain)).full, /APPLICATION-READ REPOSITORY FILES/);
});

test("A code fix shows the text the diff applies to and the test file of the changed file", async () => {
  const treeSha = "c".repeat(40);
  const files = { "calculator.py": FILES["calculator.py"], "tests/test_calculator.py": FILES["tests/test_calculator.py"] };
  const fetchImpl = async url => {
    const { pathname } = new URL(url);
    const p = decodeURIComponent(pathname).split(`/repos/${repo}`)[1];
    let result;
    if (p === `/git/commits/${sha}`) result = { sha, tree: { sha: treeSha } };
    else if (p === `/git/trees/${treeSha}`) result = { truncated: false, tree: Object.entries(files).map(([path, text]) => ({ path, mode: "100644", type: "blob", sha: blob(text), size: Buffer.byteLength(text) })) };
    else if (p.startsWith("/contents/")) {
      const path = p.slice("/contents/".length);
      const text = files[path];
      result = { type: "file", path, content: Buffer.from(text).toString("base64"), encoding: "base64", size: Buffer.byteLength(text), sha: blob(text) };
    } else throw new Error(`Unhandled ${p}`);
    return { status: 200, ok: true, async json() { return result; } };
  };
  const api = new CodeFixGitHubApi({ token: "test-token", fetchImpl });
  const plan = { repository: repo, base_commit_sha: sha, title: "Fix average divisor", description: "Divide by len(numbers).",
    files: [{ path: "calculator.py" }] };
  const issueState = { title: "broken!!!", body: "test_average fails" };
  const related = await api.relatedFiles(plan, issueState);
  assert.deepEqual(related.map(f => [f.path, f.state]), [["tests/test_calculator.py", "READ"]]);
  const text = api.fileTextEvidence(plan, [{ path: "calculator.py", content: files["calculator.py"], git_blob_sha: blob(files["calculator.py"]) }], related);
  assert.ok(text.includes("FILE `calculator.py` [FILE TO BE CHANGED]"));
  assert.ok(text.includes("7:     return sum(numbers) / (len(numbers) + 1)"));
  assert.ok(text.includes("FILE `tests/test_calculator.py` [RELATED FILE]"));
  assert.ok(text.includes("7:         self.assertEqual(average([2, 4, 6]), 4)"));
});

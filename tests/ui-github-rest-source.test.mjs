import assert from "node:assert/strict";
import test from "node:test";
import { GitHubRestSnapshotClientV2 } from "../dist/adapters/github/rest-client.js";

const SHA = "b182a69150a65b60217ef9758b1fd771f64e7d1a";

test("GitHub source read uses commit-pinned GET, not a mutable branch and never writes", async () => {
  const calls = [];
  const client = new GitHubRestSnapshotClientV2({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, async json() { return { type: "file" }; } };
    }
  });
  await client.getFileAtCommit("touhaf00/tp-cicd", ".github/workflows/ci-cd.yml", SHA);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, new RegExp("/contents/\\.github/workflows/ci-cd\\.yml\\?ref=" + SHA + "$"));
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[0].options.headers.authorization, undefined);
  await assert.rejects(client.getFileAtCommit("touhaf00/tp-cicd", "../.env", SHA), /Invalid fixed-SHA/);
  assert.equal(calls.length, 1);
});

test("The file list of a commit is read through that exact commit, never a moving reference", async () => {
  const TREE = "c".repeat(40);
  const calls = [];
  const client = new GitHubRestSnapshotClientV2({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const body = url.includes("/git/commits/") ? { sha: SHA, tree: { sha: TREE } } : { truncated: false, tree: [] };
      return { ok: true, async json() { return body; } };
    }
  });
  assert.deepEqual(await client.getTreeAtCommit("touhaf00/tp-cicd", SHA), { truncated: false, tree: [] });
  assert.match(calls[0].url, new RegExp(`/repos/touhaf00/tp-cicd/git/commits/${SHA}$`));
  assert.match(calls[1].url, new RegExp(`/repos/touhaf00/tp-cicd/git/trees/${TREE}\\?recursive=1$`));
  for (const call of calls) assert.equal(call.options.method, "GET");
  await assert.rejects(client.getTreeAtCommit("touhaf00/tp-cicd", "main"), /Invalid fixed-SHA/);

  const wrong = new GitHubRestSnapshotClientV2({
    fetchImpl: async () => ({ ok: true, async json() { return { sha: "d".repeat(40), tree: { sha: TREE } }; } })
  });
  await assert.rejects(wrong.getTreeAtCommit("touhaf00/tp-cicd", SHA), /no verifiable tree/);
});

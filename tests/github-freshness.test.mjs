import assert from "node:assert/strict";
import test from "node:test";
import { GitHubRestSnapshotClientV2 } from "../dist/adapters/github/rest-client.js";
import {
  createGitHubSnapshotResolverV2,
  getConsistentGitHubBranchHeadV2
} from "../dist/adapters/github/snapshot-resolver.js";
import { resolveResourceSnapshotV2 } from "../dist/core/snapshot-resolver.js";

const A = "a".repeat(40);
const B = "b".repeat(40);
const REPO = "touhaf00/tp-cicd";
const REF = "contextguard-drift-demo-20261104";
const subject = {
  provider: "github", resource_type: "repository_ref",
  resource_id: REPO, selector: {kind: "branch", ref: REF}
};

function fakeProvider({ refSha = A, branchSha = B, failBranch = false } = {}) {
  const calls = [];
  const fetchImpl = async (input, init) => {
    const url = new URL(String(input));
    calls.push({url, init});
    assert.equal(init.method, "GET");
    assert.equal(init.cache, "no-store");
    assert.match(init.headers["cache-control"], /no-store/);
    assert.ok(url.searchParams.get("_cg_fresh"));
    if (url.pathname.includes("/git/ref/")) {
      return Response.json({object: {type: "commit", sha: refSha}});
    }
    if (url.pathname.includes("/branches/")) {
      return failBranch
        ? Response.json({message: "unavailable"}, {status:503})
        : Response.json({name: REF, commit: {sha: branchSha}});
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  const client = new GitHubRestSnapshotClientV2({
    apiBaseUrl: "https://api.github.test", fetchImpl
  });
  return {client, calls};
}

test("stale ref and new branch endpoint disagreement fail closed", async () => {
  const {client, calls} = fakeProvider();
  await assert.rejects(
    resolveResourceSnapshotV2(createGitHubSnapshotResolverV2(client), subject),
    /GITHUB_PROVIDER_INCONSISTENT/
  );
  assert.equal(calls.length, 2);
  assert.notEqual(calls[0].url.pathname, calls[1].url.pathname);
});

test("agreeing independent endpoints resolve current branch safely", async () => {
  const {client} = fakeProvider({refSha: B, branchSha: B});
  const first = await resolveResourceSnapshotV2(
    createGitHubSnapshotResolverV2(client), subject
  );
  assert.equal(first.version, B);
});

test("missing independent confirmation fails closed", async () => {
  const {client} = fakeProvider({refSha: B, failBranch: true});
  await assert.rejects(
    resolveResourceSnapshotV2(createGitHubSnapshotResolverV2(client), subject),
    /GitHub request failed/
  );
});

test("provider cannot corroborate another branch", async () => {
  const client = {
    getRef: async () => ({object: {type:"commit",sha:B}}),
    getBranch: async () => ({name:"other",commit:{sha:B}})
  };
  await assert.rejects(
    getConsistentGitHubBranchHeadV2(client, REPO, REF),
    /GITHUB_PROVIDER_INCONSISTENT/
  );
});

test("fresh ref calls get unique cache bypass identifiers", async () => {
  const {client, calls} = fakeProvider({refSha:B,branchSha:B});
  await client.getRef(REPO, "heads", REF);
  await client.getRef(REPO, "heads", REF);
  assert.notEqual(
    calls[0].url.searchParams.get("_cg_fresh"),
    calls[1].url.searchParams.get("_cg_fresh")
  );
});

test("server GitHub evidence bridge rejects mismatching endpoints", async () => {
  const {readGitHubBranchForAgentV2} =
    await import("../dist/api/ui/cominty-pipeline.js");
  const {client} = fakeProvider();
  await assert.rejects(
    readGitHubBranchForAgentV2(
      {subject, snapshot: {version:A}},
      {getRef: client.getRef.bind(client),
       getBranch: client.getBranch.bind(client),
       getCommit: client.getCommit.bind(client)}
    ),
    /GITHUB_PROVIDER_INCONSISTENT/
  );
});

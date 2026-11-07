import assert from "node:assert/strict";
import test from "node:test";

import {
  GitHubRestClientErrorV2,
  GitHubRestSnapshotClientV2
} from "../dist/adapters/github/rest-client.js";

import {
  createGitHubSnapshotResolverRegistryV2
} from "../dist/adapters/github/registry.js";

const SHA =
  "b182a69150a65b60217ef9758b1fd771f64e7d1a";

function response(
  value,
  status = 200
) {
  return new Response(
    JSON.stringify(value),
    {
      status,
      headers: {
        "content-type":
          "application/json"
      }
    }
  );
}

function recordingClient(
  handler = async () =>
    response({})
) {
  const calls = [];

  const client =
    new GitHubRestSnapshotClientV2({
      apiBaseUrl:
        "https://api.github.test",

      fetchImpl:
        async (
          input,
          init
        ) => {
          calls.push({
            url: String(input),
            init
          });

          return handler(
            input,
            init
          );
        }
    });

  return {
    client,
    calls
  };
}

test(
  "GitHub REST client reads repository metadata without requiring a token",
  async () => {
    const {
      client,
      calls
    } =
      recordingClient(
        async () =>
          response({
            default_branch:
              "main"
          })
      );

    await client.getRepository(
      "touhaf00/contextguard"
    );

    assert.equal(
      calls.length,
      1
    );

    const url = new URL(calls[0].url);
    assert.equal(url.origin + url.pathname,
      "https://api.github.test/repos/touhaf00/contextguard");
    assert.ok(url.searchParams.get("_cg_fresh"));
    assert.equal(calls[0].init.cache, "no-store");
    assert.match(calls[0].init.headers["cache-control"], /no-store/);

    assert.equal(
      calls[0].init.method,
      "GET"
    );

    assert.equal(
      calls[0]
        .init
        .headers
        .authorization,
      undefined
    );
  }
);

test(
  "GitHub REST client sends configured bearer token only from server configuration",
  async () => {
    const calls = [];

    const client =
      new GitHubRestSnapshotClientV2({
        token:
          "github-secret",

        apiBaseUrl:
          "https://api.github.test",

        fetchImpl:
          async (
            input,
            init
          ) => {
            calls.push({
              input,
              init
            });

            return response({
              sha: SHA
            });
          }
      });

    await client.getCommit(
      "touhaf00/contextguard",
      SHA
    );

    assert.equal(
      calls[0]
        .init
        .headers
        .authorization,
      "Bearer github-secret"
    );
  }
);

test(
  "GitHub REST client safely encodes commit references",
  async () => {
    const {
      client,
      calls
    } =
      recordingClient(
        async () =>
          response({
            sha: SHA
          })
      );

    await client.getCommit(
      "touhaf00/contextguard",
      "feature/security test"
    );

    const url = new URL(calls[0].url);
    assert.equal(url.origin + url.pathname,
      "https://api.github.test/repos/touhaf00/contextguard/commits/feature%2Fsecurity%20test");
    assert.ok(url.searchParams.get("_cg_fresh"));
  }
);

test(
  "GitHub REST client addresses exact branch refs",
  async () => {
    const {
      client,
      calls
    } =
      recordingClient(
        async () =>
          response({
            object: {
              type:
                "commit",

              sha: SHA
            }
          })
      );

    await client.getRef(
      "touhaf00/contextguard",
      "heads",
      "feature/security"
    );

    const url = new URL(calls[0].url);
    assert.equal(url.origin + url.pathname,
      "https://api.github.test/repos/touhaf00/contextguard/git/ref/heads%2Ffeature%2Fsecurity");
    assert.ok(url.searchParams.get("_cg_fresh"));
  }
);

test(
  "GitHub REST client addresses annotated tag objects by exact SHA",
  async () => {
    const {
      client,
      calls
    } =
      recordingClient(
        async () =>
          response({
            object: {
              type:
                "commit",

              sha: SHA
            }
          })
      );

    await client.getGitTag(
      "touhaf00/contextguard",
      SHA
    );

    assert.equal(
      calls[0].url,
      `https://api.github.test/repos/touhaf00/contextguard/git/tags/${SHA}`
    );
  }
);

test(
  "GitHub REST client fails closed on HTTP errors",
  async () => {
    const {
      client
    } =
      recordingClient(
        async () =>
          response(
            {
              message:
                "Not Found"
            },
            404
          )
      );

    await assert.rejects(
      client.getRepository(
        "touhaf00/contextguard"
      ),
      (error) =>
        error instanceof
          GitHubRestClientErrorV2 &&
        error.code ===
          "HTTP_ERROR"
    );
  }
);

test(
  "GitHub REST client fails closed on network errors",
  async () => {
    const {
      client
    } =
      recordingClient(
        async () => {
          throw new Error(
            "network unavailable"
          );
        }
      );

    await assert.rejects(
      client.getRepository(
        "touhaf00/contextguard"
      ),
      (error) =>
        error instanceof
          GitHubRestClientErrorV2 &&
        error.code ===
          "REQUEST_FAILED"
    );
  }
);

test(
  "GitHub registry resolves a real GitHub-style branch snapshot through the REST client contract",
  async () => {
    const client =
      new GitHubRestSnapshotClientV2({
        apiBaseUrl:
          "https://api.github.test",

        fetchImpl:
          async (input) => {
            const url = new URL(String(input));
            assert.ok(url.searchParams.get("_cg_fresh"));
            if (url.pathname.endsWith("/git/ref/heads%2Fmain")) {
              return response({object: {type: "commit", sha: SHA}});
            }
            if (url.pathname.endsWith("/branches/main")) {
              return response({name: "main", commit: {sha: SHA}});
            }
            throw new Error("Unexpected provider read: " + url.pathname);
          }
      });

    const registry =
      createGitHubSnapshotResolverRegistryV2(
        client,
        {
          now: () =>
            new Date(
              "2026-11-02T01:40:00Z"
            )
        }
      );

    const snapshot =
      await registry.resolve({
        provider:
          "github",

        resource_type:
          "repository_ref",

        resource_id:
          "touhaf00/contextguard",

        selector: {
          kind:
            "branch",

          ref:
            "main"
        }
      });

    assert.equal(
      snapshot.version,
      SHA
    );

    assert.equal(
      snapshot.metadata
        .resolved_ref,
      "main"
    );

    assert.equal(
      snapshot.subject
        .provider,
      "github"
    );
  }
);

import assert from "node:assert/strict";
import test from "node:test";

import {
  GitHubExecutionTransportErrorV2,
  GitHubRestExecutionTransportV2
} from "../dist/adapters/github/execution-transport.js";

function expectCode(
  fn,
  code
) {
  assert.throws(
    fn,
    error =>
      error instanceof
        GitHubExecutionTransportErrorV2 &&
      error.code ===
        code
  );
}

async function expectAsyncCode(
  promise,
  code
) {
  await assert.rejects(
    promise,
    error =>
      error instanceof
        GitHubExecutionTransportErrorV2 &&
      error.code ===
        code
  );
}

test(
  "GitHub execution transport requires a server-side token",
  () => {
    expectCode(
      () =>
        new GitHubRestExecutionTransportV2({
          token:
            ""
        }),
      "INVALID_CONFIG"
    );
  }
);

test(
  "GitHub execution transport rejects insecure remote HTTP",
  () => {
    expectCode(
      () =>
        new GitHubRestExecutionTransportV2({
          token:
            "secret",

          apiBaseUrl:
            "http://api.github.example"
        }),
      "INVALID_CONFIG"
    );
  }
);

test(
  "GitHub execution transport sends exact POST create_issue request",
  async () => {
    const calls =
      [];

    const transport =
      new GitHubRestExecutionTransportV2({
        token:
          "server-secret-token",

        fetchImpl:
          async (
            url,
            init
          ) => {
            calls.push({
              url,
              init
            });

            return new Response(
              JSON.stringify({
                number:
                  42,

                html_url:
                  "https://github.com/touhaf00/contextguard/issues/42"
              }),
              {
                status:
                  201,

                headers: {
                  "content-type":
                    "application/json"
                }
              }
            );
          }
      });

    const result =
      await transport
        .createIssue(
          "touhaf00/contextguard",
          {
            title:
              "ContextGuard controlled test",

            body:
              "Authorized execution."
          }
        );

    assert.equal(
      calls.length,
      1
    );

    assert.equal(
      calls[0].url,
      "https://api.github.com/repos/touhaf00/contextguard/issues"
    );

    assert.equal(
      calls[0].init.method,
      "POST"
    );

    assert.equal(
      calls[0].init
        .headers
        .authorization,
      "Bearer server-secret-token"
    );

    assert.equal(
      calls[0].init
        .headers
        ["x-github-api-version"],
      "2026-03-10"
    );

    assert.deepEqual(
      JSON.parse(
        calls[0].init.body
      ),
      {
        title:
          "ContextGuard controlled test",

        body:
          "Authorized execution."
      }
    );

    assert.deepEqual(
      result,
      {
        issue_number:
          42,

        html_url:
          "https://github.com/touhaf00/contextguard/issues/42"
      }
    );
  }
);

test(
  "GitHub execution transport never adds unauthorized issue fields",
  async () => {
    let sentBody;

    const transport =
      new GitHubRestExecutionTransportV2({
        token:
          "secret",

        fetchImpl:
          async (
            _url,
            init
          ) => {
            sentBody =
              JSON.parse(
                init.body
              );

            return new Response(
              JSON.stringify({
                number:
                  7,

                html_url:
                  "https://github.com/touhaf00/contextguard/issues/7"
              }),
              {
                status:
                  201
              }
            );
          }
      });

    await transport.createIssue(
      "touhaf00/contextguard",
      {
        title:
          "Safe title",

        body:
          "Safe body"
      }
    );

    assert.deepEqual(
      Object.keys(
        sentBody
      ).sort(),
      [
        "body",
        "title"
      ]
    );

    assert.equal(
      "labels" in sentBody,
      false
    );

    assert.equal(
      "assignees" in sentBody,
      false
    );

    assert.equal(
      "milestone" in sentBody,
      false
    );
  }
);

test(
  "GitHub execution transport fails closed on non-201 response",
  async () => {
    const transport =
      new GitHubRestExecutionTransportV2({
        token:
          "secret",

        fetchImpl:
          async () =>
            new Response(
              JSON.stringify({
                message:
                  "Forbidden"
              }),
              {
                status:
                  403
              }
            )
      });

    await expectAsyncCode(
      transport.createIssue(
        "touhaf00/contextguard",
        {
          title:
            "Title",

          body:
            "Body"
        }
      ),
      "HTTP_ERROR"
    );
  }
);

test(
  "GitHub execution transport fails closed on network failure",
  async () => {
    const transport =
      new GitHubRestExecutionTransportV2({
        token:
          "secret",

        fetchImpl:
          async () => {
            throw new Error(
              "network unavailable"
            );
          }
      });

    await expectAsyncCode(
      transport.createIssue(
        "touhaf00/contextguard",
        {
          title:
            "Title",

          body:
            "Body"
        }
      ),
      "REQUEST_FAILED"
    );
  }
);

test(
  "GitHub execution transport rejects malformed success response",
  async () => {
    const transport =
      new GitHubRestExecutionTransportV2({
        token:
          "secret",

        fetchImpl:
          async () =>
            new Response(
              JSON.stringify({
                number:
                  0,

                html_url:
                  "invalid"
              }),
              {
                status:
                  201
              }
            )
      });

    await expectAsyncCode(
      transport.createIssue(
        "touhaf00/contextguard",
        {
          title:
            "Title",

          body:
            "Body"
        }
      ),
      "INVALID_RESPONSE"
    );
  }
);

test(
  "GitHub execution transport rejects malformed repository identity before network",
  async () => {
    let called =
      false;

    const transport =
      new GitHubRestExecutionTransportV2({
        token:
          "secret",

        fetchImpl:
          async () => {
            called =
              true;

            throw new Error(
              "must not execute"
            );
          }
      });

    await expectAsyncCode(
      transport.createIssue(
        "../attacker/repo",
        {
          title:
            "Title",

          body:
            "Body"
        }
      ),
      "INVALID_REPOSITORY"
    );

    assert.equal(
      called,
      false
    );
  }
);

function jsonResponse(status, value) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("The open-issue read pages through every open issue, skips pull requests and matches the title like the verification", async () => {
  const calls = [];
  const page1 = Array.from({ length: 100 }, (_, i) => ({ number: 1000 + i, title: `Other issue ${i}` }));
  page1[5] = { number: 7, title: "  ci failure in RUN 1  ", pull_request: { url: "x" } };
  const page2 = [{ number: 8, title: "  ci failure in RUN 1  " }, { number: 9, title: "CI failure in run 12" }];
  const transport = new GitHubRestExecutionTransportV2({
    token: "server-secret-token",
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return jsonResponse(200, calls.length === 1 ? page1 : page2);
    }
  });
  assert.deepEqual(await transport.findOpenIssuesWithTitle("touhaf00/contextguard", "CI failure in run 1"), [8]);
  assert.equal(calls.length, 2);
  for (const [index, call] of calls.entries()) {
    assert.match(call.url, new RegExp(`^https://api\\.github\\.com/repos/touhaf00/contextguard/issues\\?state=open&per_page=100&page=${index + 1}&_cg_fresh=`));
    assert.equal(call.init.method, "GET");
    assert.equal(call.init.cache, "no-store");
    assert.ok(call.init.signal instanceof AbortSignal, "every read has a timeout");
    assert.equal(call.init.headers.authorization, "Bearer server-secret-token");
  }
});

test("The open-issue read fails closed: HTTP error, bad JSON, bad item, or a listing too long to read completely", async () => {
  const transport = fetchImpl => new GitHubRestExecutionTransportV2({ token: "t", fetchImpl });
  await expectAsyncCode(transport(async () => jsonResponse(403, { message: "no" })).findOpenIssuesWithTitle("o/r", "x"), "HTTP_ERROR");
  await expectAsyncCode(transport(async () => new Response("not json", { status: 200 })).findOpenIssuesWithTitle("o/r", "x"), "INVALID_JSON");
  await expectAsyncCode(transport(async () => jsonResponse(200, { items: [] })).findOpenIssuesWithTitle("o/r", "x"), "INVALID_RESPONSE");
  await expectAsyncCode(transport(async () => jsonResponse(200, [{ number: "1", title: "x" }])).findOpenIssuesWithTitle("o/r", "x"), "INVALID_RESPONSE");
  await expectAsyncCode(transport(async () => { throw new Error("offline"); }).findOpenIssuesWithTitle("o/r", "x"), "REQUEST_FAILED");
  const full = Array.from({ length: 100 }, (_, i) => ({ number: i + 1, title: `Issue ${i}` }));
  let reads = 0;
  await expectAsyncCode(transport(async () => { reads++; return jsonResponse(200, full); }).findOpenIssuesWithTitle("o/r", "x"), "INVALID_RESPONSE");
  assert.equal(reads, 20);
});

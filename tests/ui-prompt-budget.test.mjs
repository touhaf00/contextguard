import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  COMINTY_MESSAGE_LIMIT,
  MIN_BLOCK_CHARS,
  PROMPT_BUDGET,
  PromptTooLargeError,
  fitMessageToLimit,
  fitPrompt,
  shortenMiddle
} from "../dist/api/ui/prompt-budget.js";
import { assembleAgentPrompt } from "../dist/api/ui/cominty-pipeline.js";
import { pipelineHttpError, UNEXPECTED_ERROR_MESSAGE } from "../dist/api/ui/pipeline-errors.js";
import { GitHubRestClientErrorV2 } from "../dist/adapters/github/rest-client.js";
import {
  APIConnectionError, APIError, AuthError, InvalidParams, PermissionError, RateLimitError, SDKError, ServerError, StreamInterrupted
} from "@cominty-ai/sdk";

const block = (label, size, tail = "CAVEAT: this proves only the lines above.") =>
  `\n${label} START\n` + Array.from({ length: Math.ceil(size / 40) }, (_, i) => `line ${i} of ${label} ................`).join("\n").slice(0, size) + `\n${tail}\n`;

test("A prompt that fits is returned byte for byte", () => {
  const sections = [
    { name: "a", text: block("A", 3000), shrinkable: true },
    { name: "b", text: block("B", 500), shrinkable: false }
  ];
  const fitted = fitPrompt("BASE ".repeat(1000), sections);
  assert.equal(fitted.prompt, "BASE ".repeat(1000) + sections[0].text + sections[1].text);
  assert.deepEqual(fitted.shortened, []);
});

test("Only the longest evidence blocks are shortened, and the total fits", () => {
  const base = "INSTRUCTIONS AND OUTPUT CONTRACT\n".repeat(400);
  const fixed = block("GUIDANCE", 1500);
  const small = block("SMALL", 1200);
  const huge = block("HUGE", 30000);
  const big = block("BIG", 9000);
  const fitted = fitPrompt(base, [
    { name: "small", text: small, shrinkable: true },
    { name: "huge", text: huge, shrinkable: true },
    { name: "guidance", text: fixed, shrinkable: false },
    { name: "big", text: big, shrinkable: true }
  ]);
  assert.ok(fitted.prompt.length <= PROMPT_BUDGET, `${fitted.prompt.length} <= ${PROMPT_BUDGET}`);
  assert.ok(fitted.prompt.startsWith(base), "the base is intact");
  assert.ok(fitted.prompt.includes(fixed), "fixed guidance is intact");
  assert.ok(fitted.prompt.includes(small), "a block under the common cap is intact");
  assert.deepEqual(fitted.shortened.map(s => s.name).sort(), ["big", "huge"]);
  for (const entry of fitted.shortened) assert.ok(entry.to < entry.from);
  assert.ok(fitted.original_length > PROMPT_BUDGET);
});

test("A shortened block keeps its start and its closing caveat, and says what is not observed", () => {
  const text = block("LOG", 20000, "CAVEAT-AT-THE-END: proves only that the log contains these lines.");
  const out = shortenMiddle(text, 4000);
  assert.ok(out.length <= 4000);
  assert.ok(out.startsWith("\nLOG START\n"));
  assert.ok(out.endsWith("CAVEAT-AT-THE-END: proves only that the log contains these lines.\n"));
  assert.match(out, /ContextGuard shortened this evidence block/);
  assert.match(out, /NOT observed/);
  assert.match(out, /must stay UNKNOWN or unverified/);
  const omitted = Number(/(\d+) characters were omitted/.exec(out)[1]);
  const note = /\n\[ContextGuard shortened[\s\S]*?\]\n/.exec(out)[0];
  assert.equal(out.length - note.length, text.length - omitted, "the stated count is the real one");
});

test("shortenMiddle never exceeds its limit, whatever the sizes", () => {
  for (const size of [901, 1500, 7777, 12345, 40000, 120000]) {
    for (const limit of [MIN_BLOCK_CHARS, 1200, 3333, 9000]) {
      const out = shortenMiddle("x".repeat(size - 1) + "\n", limit);
      assert.ok(out.length <= Math.max(limit, 0) || size <= limit, `${size} -> ${limit} gave ${out.length}`);
    }
  }
  assert.equal(shortenMiddle("short", 100), "short");
});

test("If the base alone cannot fit, the run stops with a clear error instead of cutting instructions", () => {
  assert.throws(
    () => fitPrompt("X".repeat(PROMPT_BUDGET - 100), [{ name: "e", text: block("E", 5000), shrinkable: true }]),
    PromptTooLargeError
  );
  assert.throws(
    () => fitPrompt("X".repeat(PROMPT_BUDGET), [{ name: "fixed", text: "Y".repeat(10), shrinkable: false }]),
    PromptTooLargeError
  );
});

test("fitMessageToLimit leaves room under the Cominty limit", () => {
  const long = "Z".repeat(80000);
  const out = fitMessageToLimit(long);
  assert.ok(out.length <= COMINTY_MESSAGE_LIMIT - 1000);
  assert.equal(fitMessageToLimit("short"), "short");
});

test("The budget keeps room for the format note and the Guard's single retry", () => {
  const formatNote = 450;
  const guardRetryNote = 1500;
  assert.ok(PROMPT_BUDGET + guardRetryNote + formatNote < COMINTY_MESSAGE_LIMIT);
});

test("assembleAgentPrompt uses the lowest level at which everything fits, and shortens evidence last", () => {
  const sizes = [18000, 12000, 6000];
  const built = [];
  const base = level => { built.push(level); return String(level).repeat(sizes[level]); };

  let out = assembleAgentPrompt("GUARD", base, [{ name: "e", text: block("E", 2000), shrinkable: true }], 2);
  assert.ok(out.startsWith("0"));
  assert.deepEqual(built, [0]);

  built.length = 0;
  out = assembleAgentPrompt("GUARD", base, [{ name: "e", text: block("E", 14000), shrinkable: true }], 2);
  assert.ok(out.startsWith("1") && out.length <= PROMPT_BUDGET);
  assert.ok(!out.includes("ContextGuard shortened"), "evidence untouched while a lower level is enough");
  assert.deepEqual(built, [0, 1]);

  built.length = 0;
  out = assembleAgentPrompt("GUARD", base, [{ name: "e", text: block("E", 22000), shrinkable: true }], 2);
  assert.ok(out.startsWith("2") && !out.includes("ContextGuard shortened"));
  assert.deepEqual(built, [0, 1, 2]);

  built.length = 0;
  out = assembleAgentPrompt("GUARD", base, [{ name: "e", text: block("E", 40000), shrinkable: true }], 2);
  assert.ok(out.startsWith("2") && out.length <= PROMPT_BUDGET);
  assert.match(out, /ContextGuard shortened this evidence block/);

  built.length = 0;
  assembleAgentPrompt("WORKER", base, [{ name: "e", text: block("E", 40000), shrinkable: true }], 1);
  assert.deepEqual(built, [0, 1, 1]);
});

const init = (status, extra = {}) => ({ status, detail: "SECRET-DETAIL-sk-" + "a".repeat(30), body: {}, headers: new Headers(extra) });

test("Errors from Cominty become clear messages that never echo SDK details", () => {
  const cases = [
    [new InvalidParams("chat.start", [{ param: "message", message: "must be at most 30000 characters, got 33105" }]), 502, /size or format/],
    [new AuthError("401 SECRET", init(401)), 502, /API key/],
    [new PermissionError("403 SECRET", init(403)), 502, /API key/],
    [new RateLimitError("429 SECRET", init(429)), 429, /quota|busy/i],
    [new ServerError("500 SECRET", init(500)), 502, /HTTP 500/],
    [new APIError("402 SECRET", init(402)), 502, /HTTP 402/],
    [new APIConnectionError("ECONNRESET SECRET"), 502, /could not be reached/],
    [new SDKError("bug SECRET"), 502, /could not complete/]
  ];
  for (const [error, status, pattern] of cases) {
    const mapped = pipelineHttpError(error);
    assert.ok(mapped, error.constructor.name);
    assert.equal(mapped.status, status, error.constructor.name);
    assert.match(mapped.message, pattern, error.constructor.name);
    assert.match(mapped.message, /Nothing was written/, error.constructor.name);
    assert.doesNotMatch(mapped.message, /SECRET|sk-/, error.constructor.name);
  }
  assert.equal(pipelineHttpError(new StreamInterrupted("cut", {})).status, 502);
});

test("A prompt that cannot be made to fit is reported as a narrower-task request", () => {
  const mapped = pipelineHttpError(new PromptTooLargeError(31000, PROMPT_BUDGET));
  assert.equal(mapped.status, 422);
  assert.match(mapped.message, /too large for one agent message/);
  assert.match(mapped.message, /Nothing was written/);
});

test("Errors from GitHub reads and from the pipeline's own checks are readable", () => {
  assert.equal(pipelineHttpError(new GitHubRestClientErrorV2("HTTP_ERROR", "GitHub returned 403 for ghp_SECRET")).status, 502);
  assert.doesNotMatch(pipelineHttpError(new GitHubRestClientErrorV2("HTTP_ERROR", "ghp_SECRET")).message, /ghp_/);
  assert.equal(pipelineHttpError(new GitHubRestClientErrorV2("REQUEST_FAILED", "x")).status, 502);
  assert.equal(pipelineHttpError(new GitHubRestClientErrorV2("INVALID_CONFIG", "x")).status, 400);

  const conflicts = [
    "GITHUB_DUPLICATE_ISSUE: exact-title issue exists.",
    "GITHUB_ISSUES_STATE_CHANGED: Worker and Guard observations disagree.",
    "GITHUB_SOURCE_EVIDENCE_CHANGED: independent source reads disagree.",
    "GITHUB_OBSERVATION_CHANGED: branch HEAD differs from the initial trusted snapshot.",
    "GITHUB_ISSUE_CHANGED: issue differs from the exact server-locked version.",
    "GitHub commit does not match the branch reference."
  ];
  for (const message of conflicts) {
    const mapped = pipelineHttpError(new Error(message));
    assert.equal(mapped?.status, 409, message);
    assert.match(mapped.message, /Nothing was written|Prepare a new proposal/, message);
    assert.doesNotMatch(mapped.message, /GITHUB_|Worker and Guard observations/, message);
  }
  assert.equal(pipelineHttpError(new Error("INVALID_ISSUE_BINDING")).status, 400);
});

test("A refused code fix explains itself with sanitized, bounded text", () => {
  const mapped = pipelineHttpError(new Error("CODE_FIX_DENIED: old_text must be unique in the file\u0007\u001b[31m" + "!".repeat(500)));
  assert.equal(mapped.status, 422);
  assert.match(mapped.message, /^ContextGuard refused this code fix: old_text must be unique in the file/);
  assert.doesNotMatch(mapped.message, /[\u0000-\u001f]/);
  assert.ok(mapped.message.length < 400);
});

test("Unknown errors are not guessed at, and the fallback text is not the old opaque one", () => {
  assert.equal(pipelineHttpError(new Error("something unrelated")), null);
  assert.equal(pipelineHttpError("a string"), null);
  assert.match(UNEXPECTED_ERROR_MESSAGE, /Nothing was written/);
  assert.match(UNEXPECTED_ERROR_MESSAGE, /terminal/);
  const server = readFileSync(new URL("../src/server.ts", import.meta.url), "utf8");
  assert.match(server, /pipelineHttpError\(error\)/);
  assert.doesNotMatch(server, /"Internal server error\."/);
});

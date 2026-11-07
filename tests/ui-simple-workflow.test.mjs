import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const html =
  await readFile(
    new URL(
      "../public/index.html",
      import.meta.url
    ),
    "utf8"
  );

const app =
  await readFile(
    new URL(
      "../public/app.js",
      import.meta.url
    ),
    "utf8"
  );

test(
  "Simple workflow exposes protected continuation after approval",
  () => {
    assert.match(
      html,
      /id="simpleContinueGate"/
    );

    assert.match(
      html,
      /id="simpleContinueButton"/
    );

    assert.match(
      html,
      /Continue protected authorization/
    );

    assert.match(
      app,
      /async function continueSimpleAuthorization\(\)/
    );

    assert.match(
      app,
      /await runPreflight\(\);/
    );

    assert.match(
      app,
      /elements\.receiptButton\.disabled/
    );

    assert.match(
      app,
      /await issueReceipt\(\);/
    );

    assert.match(
      app,
      /elements\.simpleContinueButton[\s\S]*?addEventListener/
    );
  }
);

test(
  "header describes protected workflow without claiming execution availability",
  () => {
    assert.match(
      html,
      /Protected workflow/
    );

    assert.doesNotMatch(
      html,
      /Trusted execution/
    );
  }
);


test(
  "approval UI follows the server-returned decision",
  () => {
    const start =
      app.indexOf(
        "async function decideApproval("
      );

    const end =
      app.indexOf(
        "async function continueSimpleAuthorization()",
        start
      );

    assert.notEqual(
      start,
      -1
    );

    assert.notEqual(
      end,
      -1
    );

    const approvalFlow =
      app.slice(
        start,
        end
      );

    const responseStart =
      approvalFlow.indexOf(
        "const result ="
      );

    assert.notEqual(
      responseStart,
      -1
    );

    const afterServerResponse =
      approvalFlow.slice(
        responseStart
      );

    assert.match(
      afterServerResponse,
      /const approvalDecision\s*=\s*result\.approval\s*\.decision/
    );

    assert.match(
      afterServerResponse,
      /renderSimpleApprovalDecision\(\s*approvalDecision\s*\)/
    );

    assert.match(
      afterServerResponse,
      /approvalDecision\s*===\s*"APPROVED"/
    );

    assert.doesNotMatch(
      afterServerResponse,
      /\bdecision\s*===\s*"APPROVED"/
    );

    assert.doesNotMatch(
      afterServerResponse,
      /renderSimpleApprovalDecision\(\s*decision\s*\)/
    );
  }
);


test(
  "Simple progress distinguishes unvisited stages from actual failures",
  () => {
    const startStateStart =
      app.indexOf(
        "function renderSimpleStartState("
      );

    const startStateEnd =
      app.indexOf(
        "function renderSimpleApprovalDecision(",
        startStateStart
      );

    const startState =
      app.slice(
        startStateStart,
        startStateEnd
      );

    assert.match(
      startState,
      /elements\.simpleApprovalStep,\s*"pending"/
    );

    assert.match(
      startState,
      /elements\.simplePreflightStep,\s*"pending"/
    );

    assert.match(
      startState,
      /elements\.simpleReceiptStep,\s*"pending"/
    );

    assert.match(
      startState,
      /authorization\?\.status/
    );


    const approvalStart =
      app.indexOf(
        "function renderSimpleApprovalDecision("
      );

    const approvalEnd =
      app.indexOf(
        "function renderSimplePreflightState(",
        approvalStart
      );

    const approvalFlow =
      app.slice(
        approvalStart,
        approvalEnd
      );

    assert.match(
      approvalFlow,
      /elements\.simpleApprovalStep,\s*"blocked"/
    );


    const preflightStart =
      app.indexOf(
        "function renderSimplePreflightState("
      );

    const preflightEnd =
      app.indexOf(
        "function renderSimpleReceiptReady(",
        preflightStart
      );

    const preflightFlow =
      app.slice(
        preflightStart,
        preflightEnd
      );

    assert.match(
      preflightFlow,
      /elements\.simpleContinueGate,\s*false/
    );

    assert.match(
      preflightFlow,
      /elements\.simpleContinueButton\s*\.disabled\s*=\s*true/
    );


    const receiptStart =
      app.indexOf(
        "async function issueReceipt()"
      );

    const receiptEnd =
      app.indexOf(
        "async function executeAction(",
        receiptStart
      );

    const receiptFlow =
      app.slice(
        receiptStart,
        receiptEnd
      );

    assert.match(
      receiptFlow,
      /elements\.simpleReceiptStep,\s*"blocked"/
    );
  }
);

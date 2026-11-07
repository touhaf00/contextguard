import assert from "node:assert/strict";
import {
  createServer
} from "node:http";
import test from "node:test";

import {
  authorizationRequestDigest
} from "../dist/core/authorization-integrity.js";

import {
  evidenceProtocolDigest
} from "../dist/core/evidence.js";

import {
  workerAssessmentDigest
} from "../dist/core/assessment.js";

import {
  SnapshotResolverRegistryV2
} from "../dist/core/snapshot-resolver.js";

import {
  GenericAuthorizationServiceV2
} from "../dist/api/v2/service.js";

import {
  GenericApprovalAccessGateV2
} from "../dist/api/v2/approval-access.js";

import {
  GenericRuntimeAccessGateV2
} from "../dist/api/v2/runtime-access.js";

import {
  GenericAuthorizationServiceHttpV2
} from "../dist/api/v2/service-http.js";

const RUNTIME_TOKEN =
  "runtime-e2e-secret";

const APPROVAL_TOKEN =
  "approval-e2e-secret";

function buildPipeline() {
  const timestamp =
    new Date().toISOString();

  const subject = {
    provider:
      "stripe",

    resource_type:
      "payment",

    resource_id:
      "pi_http_e2e"
  };

  const request = {
    request_id:
      `req-http-e2e-${crypto.randomUUID()}`,

    subject,

    snapshot: {
      snapshot_id:
        "payment-locked-state",

      subject,

      version:
        "state-v1",

      observed_at:
        timestamp
    },

    proposed_action: {
      namespace:
        "stripe",

      action:
        "refund_payment",

      parameters: {
        amount:
          2500
      }
    },

    policy: {
      policy_id:
        "http-e2e-refund-policy",

      version:
        "1.0.0",

      name:
        "HTTP E2E refund policy",

      objective:
        "Verify refund authorization before execution.",

      decision_rules: [
        "Payment must remain refundable."
      ],

      human_approval:
        "REQUIRED",

      preflight_required:
        true
    },

    runtime: {
      platform:
        "cominty",

      worker_agent_id:
        "worker-http-e2e",

      guard_agent_id:
        "guard-http-e2e",

      tool_scope: [
        "stripe.read"
      ]
    },

    requested_at:
      timestamp
  };

  const evidence = {
    protocol_version:
      "2",

    request_digest:
      authorizationRequestDigest(
        request
      ),

    assembled_at:
      timestamp,

    evidence: [
      {
        evidence_id:
          "E1",

        source_snapshot: {
          snapshot_id:
            "payment-evidence-state",

          subject,

          version:
            "state-v1",

          observed_at:
            timestamp
        },

        locator:
          "stripe.payment",

        observation:
          "Payment remains refundable.",

        level:
          "OUTPUT_OBSERVED"
      }
    ],

    claims: [
      {
        claim_id:
          "C1",

        statement:
          "Payment remains refundable.",

        criticality:
          "REQUIRED",

        status:
          "SUPPORTED",

        evidence_refs: [
          "E1"
        ]
      }
    ]
  };

  const worker = {
    protocol_version:
      "2",

    request_digest:
      authorizationRequestDigest(
        request
      ),

    evidence_digest:
      evidenceProtocolDigest(
        evidence,
        request
      ),

    decision:
      "READY",

    confidence:
      0.95,

    summary:
      "Payment remains refundable.",

    assessed_at:
      timestamp
  };

  const guard = {
    protocol_version:
      "2",

    request_digest:
      authorizationRequestDigest(
        request
      ),

    evidence_digest:
      evidenceProtocolDigest(
        evidence,
        request
      ),

    worker_assessment_digest:
      workerAssessmentDigest(
        worker,
        evidence,
        request
      ),

    verdict:
      "PASS",

    risk:
      "LOW",

    verified_claims: [
      "C1"
    ],

    unverified_claims:
      [],

    contradicted_claims:
      [],

    findings:
      [],

    requested_checks:
      [],

    worker_decision_supported:
      true,

    retry_recommended:
      false,

    summary:
      "READY assessment is independently supported.",

    verified_at:
      timestamp
  };

  return {
    request,
    evidence,

    worker_assessment:
      worker,

    guard_verification:
      guard
  };
}

async function readJson(
  req
) {
  const chunks =
    [];

  for await (
    const chunk
    of req
  ) {
    chunks.push(
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk)
    );
  }

  const text =
    Buffer
      .concat(chunks)
      .toString("utf8");

  return JSON.parse(
    text
  );
}

function sendJson(
  res,
  status,
  body
) {
  res.writeHead(
    status,
    {
      "content-type":
        "application/json; charset=utf-8"
    }
  );

  res.end(
    JSON.stringify(body)
  );
}

async function startHarness({
  resolverVersion =
    "state-v1"
} = {}) {
  const registry =
    new SnapshotResolverRegistryV2();

  registry.register({
    resolver_version:
      "2",

    resolver_id:
      "stripe.http-e2e",

    provider:
      "stripe",

    supports(subject) {
      return (
        subject.resource_type ===
          "payment"
      );
    },

    async resolve(subject) {
      return {
        snapshot_id:
          "payment-fresh-state",

        subject:
          JSON.parse(
            JSON.stringify(
              subject
            )
          ),

        version:
          resolverVersion,

        observed_at:
          new Date()
            .toISOString()
      };
    }
  });

  const service =
    new GenericAuthorizationServiceV2({
      preflightResolverRegistry:
        registry,

      preflightContextProvider: {
        async getCurrentContext(
          session
        ) {
          const request =
            session.lock
              .intent
              .request;

          return {
            proposed_action:
              JSON.parse(
                JSON.stringify(
                  request
                    .proposed_action
                )
              ),

            policy:
              JSON.parse(
                JSON.stringify(
                  request.policy
                )
              ),

            runtime:
              JSON.parse(
                JSON.stringify(
                  request.runtime
                )
              )
          };
        }
      }
    });

  const approvalAccess =
    new GenericApprovalAccessGateV2({
      accessToken:
        APPROVAL_TOKEN,

      principalId:
        "operator-http-e2e",

      displayName:
        "HTTP E2E Operator"
    });

  const runtimeAccess =
    new GenericRuntimeAccessGateV2({
      accessToken:
        RUNTIME_TOKEN
    });

  const http =
    new GenericAuthorizationServiceHttpV2(
      service,
      approvalAccess,
      runtimeAccess
    );

  const server =
    createServer(
      async (
        req,
        res
      ) => {
        try {
          const body =
            await readJson(
              req
            );

          let result;

          if (
            req.method ===
              "POST" &&
            req.url ===
              "/api/v2/authorization"
          ) {
            result =
              http.authorize(
                body,
                req.headers
                  .authorization
              );
          } else if (
            req.method ===
              "POST" &&
            req.url ===
              "/api/v2/approval"
          ) {
            result =
              http.approve(
                body,
                req.headers
                  .authorization
              );
          } else if (
            req.method ===
              "POST" &&
            req.url ===
              "/api/v2/execution-receipt"
          ) {
            result =
              await http
                .issueExecutionReceipt(
                  body,
                  req.headers
                    .authorization
                );
          } else if (
            req.method ===
              "POST" &&
            req.url ===
              "/api/v2/execution-receipt/consume"
          ) {
            result =
              http
                .consumeExecutionReceipt(
                  body,
                  req.headers
                    .authorization
                );
          } else if (
            req.method ===
              "POST" &&
            req.url ===
              "/api/v2/preflight"
          ) {
            result =
              await http.preflight(
                body,
                req.headers
                  .authorization
              );
          } else {
            sendJson(
              res,
              404,
              {
                error:
                  "not found"
              }
            );

            return;
          }

          sendJson(
            res,
            result.status,
            result.body
          );
        } catch (error) {
          sendJson(
            res,
            500,
            {
              error:
                error instanceof Error
                  ? error.message
                  : "unknown error"
            }
          );
        }
      }
    );

  await new Promise(
    (
      resolve,
      reject
    ) => {
      server.once(
        "error",
        reject
      );

      server.listen(
        0,
        "127.0.0.1",
        resolve
      );
    }
  );

  const address =
    server.address();

  if (
    !address ||
    typeof address ===
      "string"
  ) {
    throw new Error(
      "HTTP test server did not expose a TCP port."
    );
  }

  return {
    baseUrl:
      `http://127.0.0.1:${address.port}`,

    async close() {
      await new Promise(
        (
          resolve,
          reject
        ) => {
          server.close(
            (error) => {
              if (error) {
                reject(error);
                return;
              }

              resolve();
            }
          );
        }
      );
    }
  };
}

async function post(
  baseUrl,
  path,
  token,
  body
) {
  const response =
    await fetch(
      `${baseUrl}${path}`,
      {
        method:
          "POST",

        headers: {
          "content-type":
            "application/json",

          ...(token
            ? {
                authorization:
                  `Bearer ${token}`
              }
            : {})
        },

        body:
          JSON.stringify(
            body
          )
      }
    );

  return {
    status:
      response.status,

    body:
      await response.json()
  };
}

test(
  "full HTTP authorization approval preflight cycle reaches executor boundary without executing",
  async (
    t
  ) => {
    const harness =
      await startHarness();

    t.after(
      async () => {
        await harness.close();
      }
    );

    const authorization =
      await post(
        harness.baseUrl,
        "/api/v2/authorization",
        RUNTIME_TOKEN,
        buildPipeline()
      );

    assert.equal(
      authorization.status,
      200
    );

    assert.equal(
      authorization.body.status,
      "AWAITING_HUMAN_APPROVAL"
    );

    assert.equal(
      authorization.body.next_step,
      "COLLECT_HUMAN_APPROVAL"
    );

    assert.equal(
      authorization.body
        .external_action_executed,
      false
    );

    const sessionId =
      authorization.body
        .session
        .session_id;

    assert.ok(
      sessionId
    );

    const approval =
      await post(
        harness.baseUrl,
        "/api/v2/approval",
        APPROVAL_TOKEN,
        {
          session_id:
            sessionId,

          decision:
            "APPROVED"
        }
      );

    assert.equal(
      approval.status,
      200
    );

    assert.equal(
      approval.body.status,
      "READY_FOR_PREFLIGHT"
    );

    assert.equal(
      approval.body.next_step,
      "RUN_PREFLIGHT"
    );

    assert.equal(
      approval.body
        .external_action_executed,
      false
    );

    const preflight =
      await post(
        harness.baseUrl,
        "/api/v2/preflight",
        RUNTIME_TOKEN,
        {
          session_id:
            sessionId
        }
      );

    assert.equal(
      preflight.status,
      200
    );

    assert.equal(
      preflight.body.status,
      "AUTHORIZED_FOR_EXECUTOR"
    );

    assert.equal(
      preflight.body.next_step,
      "TRUSTED_EXECUTOR"
    );

    assert.equal(
      preflight.body
        .preflight
        .status,
      "PRE_EXECUTION_VERIFIED"
    );

    assert.equal(
      preflight.body
        .preflight
        .approval_verified,
      true
    );

    assert.equal(
      preflight.body
        .execution_configured,
      false
    );

    assert.equal(
      preflight.body
        .external_action_executed,
      false
    );
  }
);

test(
  "HTTP trust boundaries reject swapped runtime and approval credentials",
  async (
    t
  ) => {
    const harness =
      await startHarness();

    t.after(
      async () => {
        await harness.close();
      }
    );

    const authorization =
      await post(
        harness.baseUrl,
        "/api/v2/authorization",
        APPROVAL_TOKEN,
        buildPipeline()
      );

    assert.equal(
      authorization.status,
      401
    );

    assert.equal(
      authorization.body
        .error
        .code,
      "UNAUTHORIZED"
    );

    const approval =
      await post(
        harness.baseUrl,
        "/api/v2/approval",
        RUNTIME_TOKEN,
        {
          session_id:
            "fake-session",

          decision:
            "APPROVED"
        }
      );

    assert.equal(
      approval.status,
      401
    );

    assert.equal(
      approval.body
        .error
        .code,
      "UNAUTHORIZED"
    );
  }
);

test(
  "HTTP preflight cannot bypass required human approval",
  async (
    t
  ) => {
    const harness =
      await startHarness();

    t.after(
      async () => {
        await harness.close();
      }
    );

    const authorization =
      await post(
        harness.baseUrl,
        "/api/v2/authorization",
        RUNTIME_TOKEN,
        buildPipeline()
      );

    assert.equal(
      authorization.status,
      200
    );

    const preflight =
      await post(
        harness.baseUrl,
        "/api/v2/preflight",
        RUNTIME_TOKEN,
        {
          session_id:
            authorization.body
              .session
              .session_id
        }
      );

    assert.equal(
      preflight.status,
      409
    );

    assert.equal(
      preflight.body
        .error
        .code,
      "APPROVAL_REQUIRED"
    );

    assert.equal(
      preflight.body
        .external_action_executed,
      false
    );
  }
);

test(
  "HTTP preflight blocks resource drift after human approval",
  async (
    t
  ) => {
    const harness =
      await startHarness({
        resolverVersion:
          "state-v2"
      });

    t.after(
      async () => {
        await harness.close();
      }
    );

    const authorization =
      await post(
        harness.baseUrl,
        "/api/v2/authorization",
        RUNTIME_TOKEN,
        buildPipeline()
      );

    assert.equal(
      authorization.status,
      200
    );

    const sessionId =
      authorization.body
        .session
        .session_id;

    const approval =
      await post(
        harness.baseUrl,
        "/api/v2/approval",
        APPROVAL_TOKEN,
        {
          session_id:
            sessionId,

          decision:
            "APPROVED"
        }
      );

    assert.equal(
      approval.status,
      200
    );

    const preflight =
      await post(
        harness.baseUrl,
        "/api/v2/preflight",
        RUNTIME_TOKEN,
        {
          session_id:
            sessionId
        }
      );

    assert.equal(
      preflight.status,
      409
    );

    assert.equal(
      preflight.body
        .error
        .code,
      "SNAPSHOT_CHANGED"
    );

    assert.equal(
      preflight.body
        .external_action_executed,
      false
    );
  }
);

test(
  "HTTP authorization receipt is issued consumed once and replay is blocked",
  async (
    t
  ) => {
    const harness =
      await startHarness();

    t.after(
      async () => {
        await harness.close();
      }
    );

    const authorization =
      await post(
        harness.baseUrl,
        "/api/v2/authorization",
        RUNTIME_TOKEN,
        buildPipeline()
      );

    assert.equal(
      authorization.status,
      200
    );

    const sessionId =
      authorization.body
        .session
        .session_id;

    const approval =
      await post(
        harness.baseUrl,
        "/api/v2/approval",
        APPROVAL_TOKEN,
        {
          session_id:
            sessionId,

          decision:
            "APPROVED"
        }
      );

    assert.equal(
      approval.status,
      200
    );

    const issued =
      await post(
        harness.baseUrl,
        "/api/v2/execution-receipt",
        RUNTIME_TOKEN,
        {
          session_id:
            sessionId
        }
      );

    assert.equal(
      issued.status,
      200
    );

    assert.equal(
      issued.body.status,
      "EXECUTION_AUTHORIZATION_ISSUED"
    );

    assert.equal(
      issued.body.external_action_executed,
      false
    );

    const receiptId =
      issued.body
        .receipt
        .receipt_id;

    const receiptDigest =
      issued.body
        .receipt
        .receipt_digest;

    assert.ok(
      receiptId
    );

    assert.match(
      receiptDigest,
      /^[0-9a-f]{64}$/
    );

    const consumed =
      await post(
        harness.baseUrl,
        "/api/v2/execution-receipt/consume",
        RUNTIME_TOKEN,
        {
          receipt_id:
            receiptId,

          receipt_digest:
            receiptDigest
        }
      );

    assert.equal(
      consumed.status,
      200
    );

    assert.equal(
      consumed.body.status,
      "EXECUTION_AUTHORIZATION_CONSUMED"
    );

    assert.equal(
      consumed.body
        .consumption
        .status,
      "CONSUMED_FOR_EXECUTION"
    );

    assert.equal(
      consumed.body
        .external_action_executed,
      false
    );

    const replay =
      await post(
        harness.baseUrl,
        "/api/v2/execution-receipt/consume",
        RUNTIME_TOKEN,
        {
          receipt_id:
            receiptId,

          receipt_digest:
            receiptDigest
        }
      );

    assert.equal(
      replay.status,
      409
    );

    assert.equal(
      replay.body
        .error
        .code,
      "ALREADY_CONSUMED"
    );
  }
);

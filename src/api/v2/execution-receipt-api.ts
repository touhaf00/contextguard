import {
  createExecutionAuthorizationReceiptV2
} from "./execution-receipt.js";

import type {
  CreateExecutionAuthorizationReceiptOptionsV2,
  ExecutionAuthorizationReceiptV2
} from "./execution-receipt.js";

import type {
  AuthorizationSessionStoreV2
} from "./session-store.js";

import type {
  AuthorizationApprovalStoreV2
} from "./approval-store.js";

import type {
  ExecutionAuthorizationReceiptStoreV2,
  ExecutionReceiptConsumptionV2
} from "./execution-receipt-store.js";

import type {
  GenericPreflightApiResponseV2
} from "./preflight.js";

export const EXECUTION_RECEIPT_API_VERSION =
  "2" as const;

const SHA256 =
  /^[0-9a-f]{64}$/i;

const ISSUE_FIELDS =
  new Set([
    "session_id"
  ]);

const CONSUME_FIELDS =
  new Set([
    "receipt_id",
    "receipt_digest"
  ]);

export type ExecutionReceiptApiErrorCodeV2 =
  | "INVALID_BODY"
  | "UNSUPPORTED_FIELD";

export class ExecutionReceiptApiErrorV2
  extends Error {
  constructor(
    public readonly code:
      ExecutionReceiptApiErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
}

export interface ExecutionReceiptIssueApiResponseV2 {
  api_version:
    typeof EXECUTION_RECEIPT_API_VERSION;

  session_id:
    string;

  request_id:
    string;

  status:
    "EXECUTION_AUTHORIZATION_ISSUED";

  next_step:
    "CONSUME_BEFORE_EXECUTION";

  receipt:
    ExecutionAuthorizationReceiptV2;

  execution_configured:
    false;

  external_action_executed:
    false;
}

export interface ExecutionReceiptConsumeApiResponseV2 {
  api_version:
    typeof EXECUTION_RECEIPT_API_VERSION;

  receipt_id:
    string;

  status:
    "EXECUTION_AUTHORIZATION_CONSUMED";

  next_step:
    "TRUSTED_EXECUTOR";

  consumption:
    ExecutionReceiptConsumptionV2;

  execution_configured:
    false;

  external_action_executed:
    false;
}

export interface IssueExecutionReceiptApiOptionsV2 {
  receipt?:
    CreateExecutionAuthorizationReceiptOptionsV2;

  storedAt?:
    string;
}

export interface ConsumeExecutionReceiptApiOptionsV2 {
  consumedAt?:
    string;

  consumptionId?:
    string;
}

export type ExecutionPreflightRunnerV2 =
  (
    body:
      {
        session_id:
          string;
      }
  ) =>
    Promise<
      GenericPreflightApiResponseV2
    >;

function asObject(
  value:
    unknown,

  label:
    string
): Record<string, unknown> {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Array.isArray(
      value
    )
  ) {
    throw new ExecutionReceiptApiErrorV2(
      "INVALID_BODY",
      `${label} must be a JSON object.`
    );
  }

  return value as
    Record<string, unknown>;
}

function rejectUnsupportedFields(
  object:
    Record<string, unknown>,

  allowed:
    Set<string>,

  label:
    string
): void {
  for (
    const key
    of Object.keys(
      object
    )
  ) {
    if (
      !allowed.has(
        key
      )
    ) {
      throw new ExecutionReceiptApiErrorV2(
        "UNSUPPORTED_FIELD",
        `${label} contains unsupported field: ${key}.`
      );
    }
  }
}

function requiredString(
  value:
    unknown,

  label:
    string
): string {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    throw new ExecutionReceiptApiErrorV2(
      "INVALID_BODY",
      `${label} must be a non-empty string.`
    );
  }

  return value.trim();
}

function issueBody(
  value:
    unknown
): {
  session_id:
    string;
} {
  const body =
    asObject(
      value,
      "Execution receipt issue request"
    );

  rejectUnsupportedFields(
    body,
    ISSUE_FIELDS,
    "Execution receipt issue request"
  );

  return {
    session_id:
      requiredString(
        body.session_id,
        "session_id"
      )
  };
}

function consumeBody(
  value:
    unknown
): {
  receipt_id:
    string;

  receipt_digest:
    string;
} {
  const body =
    asObject(
      value,
      "Execution receipt consume request"
    );

  rejectUnsupportedFields(
    body,
    CONSUME_FIELDS,
    "Execution receipt consume request"
  );

  const receiptId =
    requiredString(
      body.receipt_id,
      "receipt_id"
    );

  const receiptDigest =
    requiredString(
      body.receipt_digest,
      "receipt_digest"
    ).toLowerCase();

  if (
    !SHA256.test(
      receiptDigest
    )
  ) {
    throw new ExecutionReceiptApiErrorV2(
      "INVALID_BODY",
      "receipt_digest must be a SHA-256 hex digest."
    );
  }

  return {
    receipt_id:
      receiptId,

    receipt_digest:
      receiptDigest
  };
}

export async function issueExecutionAuthorizationApiV2(
  bodyValue:
    unknown,

  sessions:
    AuthorizationSessionStoreV2,

  approvals:
    AuthorizationApprovalStoreV2,

  receipts:
    ExecutionAuthorizationReceiptStoreV2,

  runPreflight:
    ExecutionPreflightRunnerV2,

  options:
    IssueExecutionReceiptApiOptionsV2 = {}
): Promise<ExecutionReceiptIssueApiResponseV2> {
  const body =
    issueBody(
      bodyValue
    );

  const preflight =
    await runPreflight({
      session_id:
        body.session_id
    });

  const session =
    sessions.get(
      body.session_id
    );

  let approvalRecord =
    undefined;

  const requirement =
    session.lock
      .intent
      .request
      .policy
      .human_approval;

  if (
    requirement !==
      "NONE" &&
    approvals.has(
      session.session_id
    )
  ) {
    approvalRecord =
      approvals.get(
        session
      );
  }

  const receipt =
    createExecutionAuthorizationReceiptV2(
      session,
      preflight,
      approvalRecord,
      options.receipt
    );

  const stored =
    receipts.record(
      receipt,
      {
        storedAt:
          options.storedAt
      }
    );

  return {
    api_version:
      EXECUTION_RECEIPT_API_VERSION,

    session_id:
      session.session_id,

    request_id:
      session.request_id,

    status:
      "EXECUTION_AUTHORIZATION_ISSUED",

    next_step:
      "CONSUME_BEFORE_EXECUTION",

    receipt:
      stored.receipt,

    execution_configured:
      false,

    external_action_executed:
      false
  };
}

export function consumeExecutionAuthorizationApiV2(
  bodyValue:
    unknown,

  receipts:
    ExecutionAuthorizationReceiptStoreV2,

  options:
    ConsumeExecutionReceiptApiOptionsV2 = {}
): ExecutionReceiptConsumeApiResponseV2 {
  const body =
    consumeBody(
      bodyValue
    );

  const consumption =
    receipts.consume(
      body.receipt_id,
      body.receipt_digest,
      {
        consumedAt:
          options.consumedAt,

        consumptionId:
          options.consumptionId
      }
    );

  return {
    api_version:
      EXECUTION_RECEIPT_API_VERSION,

    receipt_id:
      consumption.receipt_id,

    status:
      "EXECUTION_AUTHORIZATION_CONSUMED",

    next_step:
      "TRUSTED_EXECUTOR",

    consumption,

    execution_configured:
      false,

    external_action_executed:
      false
  };
}

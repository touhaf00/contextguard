import {
  validateTrustedExecutionAuthorizationV2
} from "../../core/trusted-executor.js";

import type {
  TrustedExecutorResultV2,
  TrustedExecutorV2
} from "../../core/trusted-executor.js";

import type {
  ExecutionAuthorizationReceiptStoreV2
} from "./execution-receipt-store.js";

import {
  recordExecutionProofAndAuditV2
} from "./execution-proof-audit.js";

import type {
  ExecutionProofAuditResultV2,
  RecordExecutionProofOptionsV2
} from "./execution-proof-audit.js";

export const GENERIC_EXECUTION_API_VERSION =
  "2" as const;

const SHA256 =
  /^[0-9a-f]{64}$/i;

const BODY_FIELDS =
  new Set([
    "receipt_id",
    "receipt_digest"
  ]);

export type GenericExecutionApiErrorCodeV2 =
  | "INVALID_BODY"
  | "UNSUPPORTED_FIELD"
  | "INVALID_EXECUTOR_RESULT"
  | "EXECUTOR_RESULT_MISMATCH";

export class GenericExecutionApiErrorV2
  extends Error {
  constructor(
    public readonly code:
      GenericExecutionApiErrorCodeV2,

    message:
      string
  ) {
    super(message);
  }
}

export interface GenericExecutionApiResponseV2
  extends ExecutionProofAuditResultV2 {
  api_version:
    typeof GENERIC_EXECUTION_API_VERSION;

  receipt_id:
    string;

  consumption_id:
    string;

  status:
    "EXECUTED";

  result:
    TrustedExecutorResultV2;

  execution_configured:
    true;

  external_action_executed:
    true;
}

export interface GenericExecutionApiOptionsV2 {
  consumedAt?:
    string;

  consumptionId?:
    string;

  checkedAt?:
    string;
}

function clone<T>(
  value:
    T
): T {
  return JSON.parse(
    JSON.stringify(value)
  ) as T;
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
    throw new GenericExecutionApiErrorV2(
      "INVALID_BODY",
      `${label} must be a non-empty string.`
    );
  }

  return value.trim();
}

function body(
  value:
    unknown
): {
  receipt_id:
    string;

  receipt_digest:
    string;
} {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Array.isArray(
      value
    )
  ) {
    throw new GenericExecutionApiErrorV2(
      "INVALID_BODY",
      "Execution request must be a JSON object."
    );
  }

  const object =
    value as
      Record<string, unknown>;

  for (
    const key
    of Object.keys(
      object
    )
  ) {
    if (
      !BODY_FIELDS.has(
        key
      )
    ) {
      throw new GenericExecutionApiErrorV2(
        "UNSUPPORTED_FIELD",
        `Execution request contains unsupported field: ${key}.`
      );
    }
  }

  const receiptId =
    requiredString(
      object.receipt_id,
      "receipt_id"
    );

  const receiptDigest =
    requiredString(
      object.receipt_digest,
      "receipt_digest"
    ).toLowerCase();

  if (
    !SHA256.test(
      receiptDigest
    )
  ) {
    throw new GenericExecutionApiErrorV2(
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

function validateExecutorResult(
  value:
    unknown,

  receiptId:
    string,

  consumptionId:
    string,

  expectedProvider:
    string,

  expectedAction:
    string,

  verifiedAt:
    string
): TrustedExecutorResultV2 {
  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Array.isArray(
      value
    )
  ) {
    throw new GenericExecutionApiErrorV2(
      "INVALID_EXECUTOR_RESULT",
      "Trusted executor returned an invalid result."
    );
  }

  const result =
    value as
      Record<string, unknown>;

  if (
    result.executor_version !==
      "2" ||
    result.status !==
      "EXECUTED" ||
    result.external_action_executed !==
      true
  ) {
    throw new GenericExecutionApiErrorV2(
      "INVALID_EXECUTOR_RESULT",
      "Trusted executor did not return a successful execution result."
    );
  }

  if (
    result.receipt_id !==
      receiptId ||
    result.consumption_id !==
      consumptionId
  ) {
    throw new GenericExecutionApiErrorV2(
      "EXECUTOR_RESULT_MISMATCH",
      "Trusted executor result is bound to another authorization."
    );
  }

  if (
    result.provider !==
      expectedProvider ||
    result.action !==
      expectedAction
  ) {
    throw new GenericExecutionApiErrorV2(
      "EXECUTOR_RESULT_MISMATCH",
      "Trusted executor result does not match the authorized provider action."
    );
  }

  if (
    typeof result.completed_at !==
      "string" ||
    !Number.isFinite(
      Date.parse(
        result.completed_at
      )
    )
  ) {
    throw new GenericExecutionApiErrorV2(
      "INVALID_EXECUTOR_RESULT",
      "Trusted executor result has an invalid completion timestamp."
    );
  }

  if (
    Date.parse(
      result.completed_at
    ) <
    Date.parse(
      verifiedAt
    )
  ) {
    throw new GenericExecutionApiErrorV2(
      "INVALID_EXECUTOR_RESULT",
      "Trusted executor cannot complete before authorization verification."
    );
  }

  return clone(
    value as
      TrustedExecutorResultV2
  );
}

export async function executeExecutionAuthorizationApiV2(
  bodyValue:
    unknown,

  receipts:
    ExecutionAuthorizationReceiptStoreV2,

  executor:
    TrustedExecutorV2,

  options:
    GenericExecutionApiOptionsV2 = {},

  evidenceOptions:
    RecordExecutionProofOptionsV2 = {}
): Promise<GenericExecutionApiResponseV2> {
  const request =
    body(
      bodyValue
    );

  const record =
    receipts.get(
      request.receipt_id
    );

  const consumption =
    receipts.consume(
      request.receipt_id,
      request.receipt_digest,
      {
        consumedAt:
          options.consumedAt,

        consumptionId:
          options.consumptionId
      }
    );

  const authorization =
    validateTrustedExecutionAuthorizationV2(
      record.receipt,
      consumption,
      {
        checkedAt:
          options.checkedAt ??
          new Date()
            .toISOString()
      }
    );

  const rawResult =
    await executor.execute(
      authorization
    );

  const result =
    validateExecutorResult(
      rawResult,
      record.receipt_id,
      consumption.consumption_id,
      record.receipt.subject.provider,
      record.receipt.proposed_action.action,
      authorization.verified_at
    );

  const executionEvidence =
    await recordExecutionProofAndAuditV2(
      {
        receipt_id:
          record.receipt_id,

        receipt_digest:
          record.receipt_digest,

        consumption_id:
          consumption.consumption_id,

        consumption_digest:
          consumption.consumption_digest,

        lock_id:
          record.receipt.lock_id,

        lock_fingerprint:
          record.receipt.lock_fingerprint,

        action_digest:
          record.receipt.action_digest,

        authorized_snapshot_version:
          record.receipt
            .authorized_snapshot_version,

        provider:
          record.receipt.subject.provider,

        action:
          record.receipt
            .proposed_action
            .action,

        verified_at:
          authorization.verified_at,

        result
      },
      evidenceOptions
    );

  return {
    api_version:
      GENERIC_EXECUTION_API_VERSION,

    receipt_id:
      record.receipt_id,

    consumption_id:
      consumption.consumption_id,

    status:
      "EXECUTED",

    result,

    ...executionEvidence,

    execution_configured:
      true,

    external_action_executed:
      true
  };
}
